"""Query service for NL-to-Cypher generation, safety validation, and execution."""

import logging
import re
from typing import Any

from neo4j.exceptions import Neo4jError
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.errors import ValidationError
from app.graph.connection import check_graph_connectivity, get_reader_driver
from app.llm.client import generate_cypher_and_explanation
from app.llm.validator import validate_cypher_query
from app.services.ingestion import _memory_edges, _memory_nodes

logger = logging.getLogger(__name__)


class ModelOption(BaseModel):
    """Available LLM model configuration option."""

    id: str
    name: str
    provider: str
    default: bool = False


class QueryHighlight(BaseModel):
    """Matching node and edge IDs to be highlighted in the Cytoscape graph canvas."""

    node_ids: list[str] = Field(default_factory=list)
    edge_ids: list[str] = Field(default_factory=list)


class QueryResult(BaseModel):
    """Complete query response returned to user."""

    question: str
    cypher: str
    explanation: str
    highlight: QueryHighlight
    records_count: int
    raw_records: list[dict[str, Any]] = Field(default_factory=list)


AVAILABLE_MODELS: list[ModelOption] = [
    ModelOption(
        id="openai/gpt-oss-120b",
        name="Groq GPT-OSS 120B",
        provider="Groq",
        default=True,
    ),
    ModelOption(
        id="qwen/qwen3.8-27b",
        name="Groq Qwen 3.8 27B",
        provider="Groq",
        default=False,
    ),
    ModelOption(
        id="openai/gpt-oss-20b",
        name="Groq GPT-OSS 20B",
        provider="Groq",
        default=False,
    ),
    ModelOption(
        id="llama-3.3-70b-versatile",
        name="Groq Llama 3.3 70B",
        provider="Groq",
        default=False,
    ),
    ModelOption(
        id="gpt-4o-mini",
        name="OpenAI GPT-4o Mini",
        provider="OpenAI",
        default=False,
    ),
    ModelOption(
        id="claude-3-5-sonnet",
        name="Claude 3.5 Sonnet",
        provider="Anthropic",
        default=False,
    ),
]


def get_available_models() -> list[ModelOption]:
    """Return supported LLM models for NL-to-Cypher translation."""
    return AVAILABLE_MODELS


def _extract_highlights_from_memory(
    question: str,
) -> tuple[list[str], list[str], list[dict[str, Any]]]:
    """Extract matching node and edge IDs from in-memory cache for offline/demo resilience."""
    q_lower = question.lower()
    matched_node_ids: set[str] = set()
    matched_edge_ids: set[str] = set()
    records: list[dict[str, Any]] = []

    # 1. Orphan agents query
    is_orphan = (
        "no policy" in q_lower
        or "orphan" in q_lower
        or "unattached" in q_lower
        or "without policy" in q_lower
    )
    if is_orphan:
        governed_agent_ids = {
            e["source"] for e in _memory_edges.values() if e.get("type") == "GOVERNED_BY"
        }
        for n_id, node in _memory_nodes.items():
            if node.get("type") == "Agent" and n_id not in governed_agent_ids:
                matched_node_ids.add(n_id)
                records.append({"orphan_agent": node})
        return sorted(matched_node_ids), [], records

    # 2. Blast radius of a tool
    if "blast radius" in q_lower or "compromised" in q_lower:
        tool_match = re.search(r"tool\s+['\"]?([A-Za-z0-9_\- ]+)['\"]?", question, re.IGNORECASE)
        target_tool = tool_match.group(1).lower().strip() if tool_match else ""
        for n_id, node in _memory_nodes.items():
            name_matches = not target_tool or target_tool in node.get("name", "").lower()
            if node.get("type") == "Tool" and name_matches:
                matched_node_ids.add(n_id)
                # Find calling agents
                for e_id, edge in _memory_edges.items():
                    if edge.get("target") == n_id and edge.get("type") == "CAN_CALL":
                        matched_edge_ids.add(e_id)
                        agent_id = edge.get("source")
                        if agent_id:
                            matched_node_ids.add(agent_id)
                            # Find owning user
                            for u_edge_id, u_edge in _memory_edges.items():
                                is_owner = (
                                    u_edge.get("target") == agent_id
                                    and u_edge.get("type") == "OWNS"
                                )
                                if is_owner:
                                    matched_edge_ids.add(u_edge_id)
                                    if u_edge.get("source"):
                                        matched_node_ids.add(u_edge["source"])
        return sorted(matched_node_ids), sorted(matched_edge_ids), records

    # 3. Tools accessed by Agent
    if "tool" in q_lower and ("agent" in q_lower or "access" in q_lower or "call" in q_lower):
        quote_match = re.search(r"['\"]([A-Za-z0-9_\- ]+)['\"]", question)
        target_agent = ""
        if quote_match:
            target_agent = quote_match.group(1).lower().strip()
        else:
            pre_m = re.search(
                r"(?:can|does|is|for)\s+([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)*)\s+agent",
                question,
                re.IGNORECASE,
            )
            if pre_m:
                target_agent = pre_m.group(1).lower().strip()
            else:
                post_m = re.search(
                    r"agent\s+([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)*)", question, re.IGNORECASE
                )
                if post_m:
                    toks = [
                        w
                        for w in post_m.group(1).strip().split()
                        if w.lower() not in ("access", "have", "call", "use", "to", "can", "is")
                    ]
                    if toks:
                        target_agent = " ".join(toks).lower()
        for e_id, edge in _memory_edges.items():
            if edge.get("type") == "CAN_CALL":
                agent_node = _memory_nodes.get(edge.get("source", ""))
                name_matches = bool(
                    agent_node
                    and (
                        not target_agent
                        or target_agent in str(agent_node.get("name", "")).lower()
                    )
                )
                if agent_node and name_matches:
                    matched_edge_ids.add(e_id)
                    matched_node_ids.add(edge["source"])
                    matched_node_ids.add(edge["target"])
                    records.append(
                        {"agent": agent_node, "tool": _memory_nodes.get(edge["target"])}
                    )
        return sorted(matched_node_ids), sorted(matched_edge_ids), records

    # 4. Model usage
    if "model" in q_lower:
        for e_id, edge in _memory_edges.items():
            if edge.get("type") == "USES":
                matched_edge_ids.add(e_id)
                matched_node_ids.add(edge["source"])
                matched_node_ids.add(edge["target"])
                records.append({
                    "agent": _memory_nodes.get(edge["source"]),
                    "model": _memory_nodes.get(edge["target"]),
                })
        return sorted(matched_node_ids), sorted(matched_edge_ids), records

    # 5. DataSource access
    if "data" in q_lower or "datasource" in q_lower or "database" in q_lower:
        for e_id, edge in _memory_edges.items():
            if edge.get("type") in ("READS", "WRITES", "ACCESSES"):
                matched_edge_ids.add(e_id)
                matched_node_ids.add(edge["source"])
                matched_node_ids.add(edge["target"])
        return sorted(matched_node_ids), sorted(matched_edge_ids), records

    # Default fallback: highlight first 10 nodes
    all_nids = list(_memory_nodes.keys())[:10]
    return all_nids, [], records


async def execute_governance_query(
    question: str,
    model: str | None = None,
    effort: str = "high",
) -> QueryResult:
    """Execute natural language query against governance graph.

    1. Translates question into Cypher via LLM (or heuristic fallback).
    2. Validates Cypher for strict read-only execution safety.
    3. Runs query against read-only driver (or in-memory cache if offline).
    4. Extracts matched node and edge IDs for visual graph highlighting.
    """
    cleaned_question = question.strip()
    if not cleaned_question:
        raise ValidationError("Query question cannot be empty")

    settings = get_settings()

    # Step 1 & 2: Generate and validate Cypher query
    cypher, explanation = await generate_cypher_and_explanation(
        question=cleaned_question,
        model=model,
        effort=effort,
    )
    validated_cypher = validate_cypher_query(cypher)

    # Step 3: Execute query against Neo4j reader pool or fallback
    is_live = await check_graph_connectivity()

    node_ids: set[str] = set()
    edge_ids: set[str] = set()
    records: list[dict[str, Any]] = []

    if is_live:
        driver = get_reader_driver()
        try:
            async with driver.session(database=settings.NEO4J_DATABASE) as session:
                result = await session.run(validated_cypher)
                async for record in result:
                    rec_dict: dict[str, Any] = {}
                    for key, val in dict(record).items():
                        # Neo4j Node
                        if hasattr(val, "labels") and hasattr(val, "items"):
                            props = dict(val.items())
                            nid = str(props.get("id") or getattr(val, "element_id", ""))
                            if nid:
                                node_ids.add(nid)
                            rec_dict[key] = {
                                "id": nid,
                                "name": props.get("name", nid),
                                "labels": list(val.labels),
                                "props": props,
                            }
                        # Neo4j Relationship
                        elif hasattr(val, "type") and hasattr(val, "nodes"):
                            rel_props = dict(val.items()) if hasattr(val, "items") else {}
                            rid = str(rel_props.get("id") or getattr(val, "element_id", ""))
                            if rid:
                                edge_ids.add(rid)
                            rec_dict[key] = {
                                "id": rid,
                                "type": val.type,
                                "props": rel_props,
                            }
                        elif isinstance(val, dict):
                            if "id" in val:
                                node_ids.add(str(val["id"]))
                            rec_dict[key] = val
                        else:
                            rec_dict[key] = val
                    records.append(rec_dict)
        except Neo4jError as exc:
            logger.warning("Cypher execution failed on Neo4j: %s. Using memory fallback.", exc)
            mem_nodes, mem_edges, mem_recs = _extract_highlights_from_memory(cleaned_question)
            node_ids.update(mem_nodes)
            edge_ids.update(mem_edges)
            records = mem_recs
        except Exception as exc:
            logger.warning("Unexpected error during Cypher execution: %s", exc)
            mem_nodes, mem_edges, mem_recs = _extract_highlights_from_memory(cleaned_question)
            node_ids.update(mem_nodes)
            edge_ids.update(mem_edges)
            records = mem_recs
    else:
        # Offline demo / test fallback
        mem_nodes, mem_edges, mem_recs = _extract_highlights_from_memory(cleaned_question)
        node_ids.update(mem_nodes)
        edge_ids.update(mem_edges)
        records = mem_recs

    return QueryResult(
        question=cleaned_question,
        cypher=validated_cypher,
        explanation=explanation,
        highlight=QueryHighlight(
            node_ids=sorted(node_ids),
            edge_ids=sorted(edge_ids),
        ),
        records_count=len(records),
        raw_records=records[:50],  # Limit response payload size
    )
