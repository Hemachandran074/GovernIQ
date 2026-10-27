"""LLM-assisted and heuristic extraction of governance graph entities from Markdown prose."""

import json
import logging
import re
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.graph.identifiers import make_node_id
from app.graph.schema import NODE_LABELS, RELATIONSHIP_TYPES
from app.parsers.models import ParsedDocument, ParsedEdge, ParsedNode

logger = logging.getLogger(__name__)

PROSE_EXTRACTION_SYSTEM_PROMPT = """You are an expert AI Governance analyst extracting structured
graph models from free-form markdown policies, architecture documents, and security guidelines.

The allowed Node types are:
- User (Human owner, operator, or team)
- Agent (Autonomous AI agent, bot, or assistant)
- Model (Foundation LLM or specialized ML model)
- Tool (API integration, executable tool, or capability)
- DataSource (Database, storage bucket, data warehouse, or knowledge base)
- Policy (Security guideline, regulatory standard, or compliance rule)

The allowed Relationship types are:
- (:User)-[:OWNS]->(:Agent)
- (:User)-[:ACCESSES]->(:DataSource)
- (:Agent)-[:USES]->(:Model)
- (:Agent)-[:CAN_CALL]->(:Tool)
- (:Tool)-[:READS]->(:DataSource)
- (:Tool)-[:WRITES]->(:DataSource)
- (:Agent)-[:GOVERNED_BY]->(:Policy)
- (:Tool)-[:GOVERNED_BY]->(:Policy)
- (:DataSource)-[:GOVERNED_BY]->(:Policy)
- (:Model)-[:GOVERNED_BY]->(:Policy)

Instructions:
1. Extract ALL referenced agents, models, tools, data sources, users, and policies.
2. Extract all explicit and implied relationships connecting them.
3. Return STRICTLY valid JSON with no markdown formatting:
{
  "nodes": [
    {
      "name": "Customer Support Agent",
      "type": "Agent",
      "props": {"role": "support"}
    }
  ],
  "edges": [
    {
      "source": "Customer Support Agent",
      "source_type": "Agent",
      "target": "GDPR Compliance Standard",
      "target_type": "Policy",
      "type": "GOVERNED_BY",
      "props": {}
    }
  ]
}
"""


class ExtractedNode(BaseModel):
    """Pydantic model validating individual extracted entities before ingestion."""

    name: str = Field(..., min_length=1, max_length=200)
    type: Literal["User", "Agent", "Model", "Tool", "DataSource", "Policy"]
    props: dict[str, Any] = Field(default_factory=dict)


class ExtractedEdge(BaseModel):
    """Pydantic model validating individual extracted relationships before ingestion."""

    source: str = Field(..., min_length=1, max_length=200)
    source_type: Literal["User", "Agent", "Model", "Tool", "DataSource", "Policy"]
    target: str = Field(..., min_length=1, max_length=200)
    target_type: Literal["User", "Agent", "Model", "Tool", "DataSource", "Policy"]
    type: Literal[
        "OWNS",
        "ACCESSES",
        "USES",
        "CAN_CALL",
        "READS",
        "WRITES",
        "GOVERNED_BY",
    ]
    props: dict[str, Any] = Field(default_factory=dict)


class ExtractedDocumentPayload(BaseModel):
    """Container validating the complete LLM extraction payload."""

    nodes: list[ExtractedNode] = Field(default_factory=list)
    edges: list[ExtractedEdge] = Field(default_factory=list)


def heuristic_prose_extractor(content: str, filename: str) -> ExtractedDocumentPayload:
    """Deterministic regex-based fallback extractor for free-form governance text."""
    nodes: list[ExtractedNode] = []
    edges: list[ExtractedEdge] = []
    known_nodes: dict[str, ExtractedNode] = {}

    def register_node(
        name: str,
        ntype: Literal["User", "Agent", "Model", "Tool", "DataSource", "Policy"],
        props: dict[str, Any] | None = None,
    ) -> ExtractedNode:
        clean_name = name.strip()
        key = f"{ntype}:{clean_name.lower()}"
        if key not in known_nodes:
            node = ExtractedNode(name=clean_name, type=ntype, props=props or {})
            known_nodes[key] = node
            nodes.append(node)
        return known_nodes[key]

    # 1. Identify Policy Node from title or heading
    policy_name = None
    title_match = re.search(r"^#{1,2}\s+(?:Policy:?\s*)?([^\n]+)", content, re.MULTILINE)
    if title_match:
        policy_name = title_match.group(1).strip()
    else:
        policy_name = filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").title()

    policy_node = register_node(policy_name, "Policy")

    def clean_entity_name(raw_name: str) -> str:
        return re.sub(r"^(?:the|a|an)\s+", "", raw_name, flags=re.IGNORECASE).strip()

    # 2. Extract Models
    model_patterns = [
        r"\b(Claude(?:\s+[\d\.]+\s+[A-Za-z]+)?)\b",
        r"\b(GPT-[\w\.\-]+)\b",
        r"\b(Llama(?:\s+[\d\.]+\s*[\w\-]*)?)\b",
        r"\b(?:model|llm)\s+['\"]?([A-Za-z0-9_\-\. ]+)['\"]?",
    ]
    for pattern in model_patterns:
        for m in re.finditer(pattern, content, re.IGNORECASE):
            m_name = clean_entity_name(m.group(1))
            if len(m_name) > 2:
                register_node(m_name, "Model")

    # 3. Extract Tools (proper capitalized phrase ending in Tool/API/Executor/Client)
    tool_patterns = [
        (
            r"\b([A-Z][a-zA-Z0-9_\-]*(?:[ \t]+[A-Z][a-zA-Z0-9_\-]*)*"
            r"[ \t]+(?:Tool|API|Executor|Client))\b"
        ),
        r"(?:tool|api)\s+['\"]?([A-Z][A-Za-z0-9_\- ]+)['\"]?",
    ]
    for pattern in tool_patterns:
        for m in re.finditer(pattern, content):
            t_name = clean_entity_name(m.group(1))
            if len(t_name) > 2:
                register_node(t_name, "Tool")

    # 4. Extract Data Sources (proper capitalized phrase ending in Database/DB/Lake/Warehouse/Store)
    ds_patterns = [
        (
            r"\b([A-Z][a-zA-Z0-9_\-]*(?:[ \t]+[A-Z][a-zA-Z0-9_\-]*)*"
            r"[ \t]+(?:Database|DB|Lake|Warehouse|Store))\b"
        ),
        r"(?:datasource|database|data source)\s+['\"]?([A-Z][A-Za-z0-9_\- ]+)['\"]?",
    ]
    for pattern in ds_patterns:
        for m in re.finditer(pattern, content):
            d_name = clean_entity_name(m.group(1))
            if len(d_name) > 2:
                register_node(d_name, "DataSource")

    # 5. Extract Agents (proper capitalized noun phrase ending in Agent/Bot/Assistant)
    agent_patterns = [
        (
            r"\b([A-Z][a-zA-Z0-9_\-]*(?:[ \t]+[A-Z][a-zA-Z0-9_\-]*)*"
            r"[ \t]+(?:Agent|Bot|Assistant))\b"
        ),
        r"(?:agent|bot)\s+['\"]?([A-Z][A-Za-z0-9_\- ]+)['\"]?",
    ]
    for pattern in agent_patterns:
        for m in re.finditer(pattern, content):
            a_name = clean_entity_name(m.group(1))
            if len(a_name) > 2:
                register_node(a_name, "Agent")

    # 6. Extract Owners / Users
    owner_match = re.search(
        r"(?:owned by|owner:?|operator:?|operated by|lead:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
        content,
        re.IGNORECASE,
    )
    if owner_match:
        u_name = clean_entity_name(owner_match.group(1))
        if len(u_name) > 2:
            register_node(u_name, "User")

    # 7. Synthesize relationships
    agent_nodes = [n for n in nodes if n.type == "Agent"]
    user_nodes = [n for n in nodes if n.type == "User"]
    tool_nodes = [n for n in nodes if n.type == "Tool"]
    model_nodes = [n for n in nodes if n.type == "Model"]
    ds_nodes = [n for n in nodes if n.type == "DataSource"]

    # Owner -> Agent
    if user_nodes and agent_nodes:
        for a in agent_nodes:
            edges.append(
                ExtractedEdge(
                    source=user_nodes[0].name,
                    source_type="User",
                    target=a.name,
                    target_type="Agent",
                    type="OWNS",
                )
            )

    # Agent -> Model
    if agent_nodes and model_nodes:
        for a in agent_nodes:
            for model_node in model_nodes:
                edges.append(
                    ExtractedEdge(
                        source=a.name,
                        source_type="Agent",
                        target=model_node.name,
                        target_type="Model",
                        type="USES",
                    )
                )

    # Agent -> Tool
    if agent_nodes and tool_nodes:
        for a in agent_nodes:
            for t in tool_nodes:
                edges.append(
                    ExtractedEdge(
                        source=a.name,
                        source_type="Agent",
                        target=t.name,
                        target_type="Tool",
                        type="CAN_CALL",
                    )
                )

    # Tool -> DataSource
    if tool_nodes and ds_nodes:
        for t in tool_nodes:
            for d in ds_nodes:
                edges.append(
                    ExtractedEdge(
                        source=t.name,
                        source_type="Tool",
                        target=d.name,
                        target_type="DataSource",
                        type="READS",
                    )
                )

    # All primary entities -> GOVERNED_BY -> Policy
    for n in agent_nodes + tool_nodes + ds_nodes:
        edges.append(
            ExtractedEdge(
                source=n.name,
                source_type=n.type,
                target=policy_node.name,
                target_type="Policy",
                type="GOVERNED_BY",
            )
        )

    return ExtractedDocumentPayload(nodes=nodes, edges=edges)


async def extract_prose_via_llm(content: str, filename: str) -> ExtractedDocumentPayload | None:
    """Call LLM chat completion to extract governance entities and relationships."""
    settings = get_settings()
    api_key = settings.LLM_API_KEY.strip()
    if not api_key:
        return None

    base_url = settings.LLM_BASE_URL.rstrip("/")
    endpoint = f"{base_url}/chat/completions"

    payload: dict[str, Any] = {
        "model": settings.LLM_MODEL,
        "temperature": 0.0,
        "messages": [
            {"role": "system", "content": PROSE_EXTRACTION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Document filename: {filename}\n"
                    f"Content:\n{content[:4000]}"
                ),
            },
        ],
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(endpoint, json=payload, headers=headers)

        if response.status_code == 200:
            data = response.json()
            raw_content = data["choices"][0]["message"]["content"]
            parsed_json = json.loads(raw_content)

            # Invariant 4: Strict Pydantic validation before acceptance
            validated_payload = ExtractedDocumentPayload.model_validate(parsed_json)
            return validated_payload

        logger.warning(
            "LLM extraction API returned status %s: %s",
            response.status_code,
            response.text[:200],
        )
    except Exception as exc:
        logger.warning("LLM prose extraction encountered error: %s", exc)

    return None


async def extract_markdown_prose(content: str, filename: str) -> ParsedDocument:
    """Extract and validate graph nodes and edges from Markdown prose.

    Coordinates LLM-assisted extraction with deterministic fallback.
    Every element is guaranteed to adhere to the schema before write.
    """
    payload = await extract_prose_via_llm(content, filename)
    if payload is None or not payload.nodes:
        logger.info("Using deterministic heuristic prose extractor for '%s'", filename)
        payload = heuristic_prose_extractor(content, filename)

    nodes_map: dict[str, ParsedNode] = {}
    edges_map: dict[str, ParsedEdge] = {}

    for node in payload.nodes:
        # Guarantee label is in schema
        label = node.type if node.type in NODE_LABELS else "Agent"
        node_id = make_node_id(label, node.name)
        nodes_map[node_id] = ParsedNode(
            id=node_id,
            name=node.name.strip(),
            type=label,
            source_doc=filename,
            props=node.props,
        )

    for edge in payload.edges:
        source_label = edge.source_type if edge.source_type in NODE_LABELS else "Agent"
        target_label = edge.target_type if edge.target_type in NODE_LABELS else "Policy"
        source_id = make_node_id(source_label, edge.source)
        target_id = make_node_id(target_label, edge.target)

        # Validate edge type
        rel_type = edge.type if edge.type in RELATIONSHIP_TYPES else "GOVERNED_BY"

        edge_id = f"{source_id}-{rel_type}-{target_id}"
        edges_map[edge_id] = ParsedEdge(
            id=edge_id,
            source=source_id,
            target=target_id,
            type=rel_type,
            props=edge.props,
        )

    return ParsedDocument(
        source_doc=filename,
        nodes=list(nodes_map.values()),
        edges=list(edges_map.values()),
    )
