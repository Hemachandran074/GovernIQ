"""Query service for NL-to-Cypher generation, safety validation, and execution."""

import asyncio
import logging
import re
from typing import Any

import httpx
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

    # 0. Overview / Explain this graph
    is_overview = any(
        kw in q_lower
        for kw in (
            "explain",
            "overview",
            "summary",
            "summarize",
            "architecture",
            "all nodes",
            "whole graph",
            "entire graph",
            "what is in",
            "describe",
            "topology",
            "show all",
        )
    )
    if is_overview:
        all_nids = list(_memory_nodes.keys())
        all_eids = list(_memory_edges.keys())
        records = [
            {
                "summary": (
                    f"Governance graph contains {len(all_nids)} nodes and {len(all_eids)} "
                    f"relationships across agents, models, tools, data sources, users, and policies."
                )
            }
        ]
        return sorted(all_nids), sorted(all_eids), records

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

    # Default fallback: highlight active nodes and connecting edges
    all_nids = list(_memory_nodes.keys())
    all_eids = list(_memory_edges.keys())
    return sorted(all_nids), sorted(all_eids), records


async def synthesize_direct_answer(
    question: str,
    records: list[dict[str, Any]],
    node_ids: set[str],
    fallback_explanation: str,
    model: str | None = None,
) -> str:
    """Synthesize a direct, factual answer to the user's prompt based on the retrieved entities."""
    agents: set[str] = set()
    tools: set[str] = set()
    models: set[str] = set()
    data_sources: set[str] = set()
    policies: set[str] = set()
    users: set[str] = set()

    # Extract from returned database records
    for rec in records:
        for val in rec.values():
            if isinstance(val, dict):
                labels = val.get("labels", [])
                name = val.get("name") or val.get("props", {}).get("name") or val.get("id")
                if not name:
                    continue
                name_str = str(name).strip()
                if "Agent" in labels or val.get("type") == "Agent":
                    agents.add(name_str)
                elif "Tool" in labels or val.get("type") == "Tool":
                    tools.add(name_str)
                elif "Model" in labels or val.get("type") == "Model":
                    models.add(name_str)
                elif "DataSource" in labels or val.get("type") == "DataSource":
                    data_sources.add(name_str)
                elif "Policy" in labels or val.get("type") == "Policy":
                    policies.add(name_str)
                elif "User" in labels or val.get("type") == "User":
                    users.add(name_str)

    # Also enrich from memory graph cache using matched node_ids
    for nid in node_ids:
        if nid in _memory_nodes:
            mnode = _memory_nodes[nid]
            mtype = mnode.get("type", "")
            mname = str(mnode.get("name") or nid).strip()
            if mtype == "Agent":
                agents.add(mname)
            elif mtype == "Tool":
                tools.add(mname)
            elif mtype == "Model":
                models.add(mname)
            elif mtype == "DataSource":
                data_sources.add(mname)
            elif mtype == "Policy":
                policies.add(mname)
            elif mtype == "User":
                users.add(mname)

    # 1. Try real LLM direct answer synthesis if API key is present
    settings = get_settings()
    api_key = settings.LLM_API_KEY.strip()
    target_model = model or settings.LLM_MODEL
    base_url = settings.LLM_BASE_URL.rstrip("/")
    if target_model.startswith("gpt-") and settings.OPENAI_API_KEY.strip():
        api_key = settings.OPENAI_API_KEY.strip()
        base_url = "https://api.openai.com/v1"

    if api_key and (agents or tools or models or data_sources or policies or users):
        summary_lines = []
        if agents:
            summary_lines.append(f"Agents: {', '.join(sorted(agents))}")
        if tools:
            summary_lines.append(f"Tools: {', '.join(sorted(tools))}")
        if models:
            summary_lines.append(f"Models: {', '.join(sorted(models))}")
        if data_sources:
            summary_lines.append(f"DataSources: {', '.join(sorted(data_sources))}")
        if policies:
            summary_lines.append(f"Policies: {', '.join(sorted(policies))}")
        if users:
            summary_lines.append(f"Users: {', '.join(sorted(users))}")

        entities_text = "\n".join(summary_lines)

        sys_msg = (
            "You are an AI governance assistant answering questions about an AI agent graph. "
            "Give a DIRECT, factual, and concise answer (1-2 sentences) to the user's question based strictly on the query results. "
            "State the exact names of the found entities (agents, tools, models, data sources, etc.). "
            "NEVER describe the query itself or say things like 'Finds all tools...', 'Identifies...', or 'Retrieves...'."
        )
        user_msg = (
            f"User Question: {question}\n\n"
            f"Retrieved Graph Entities:\n{entities_text}\n"
            f"Total matched records: {len(records)}"
        )

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(4.0, connect=2.0)) as client:
                res = await client.post(
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": target_model,
                        "temperature": 0.0,
                        "messages": [
                            {"role": "system", "content": sys_msg},
                            {"role": "user", "content": user_msg},
                        ],
                    },
                )
                if res.status_code == 200:
                    ans = res.json()["choices"][0]["message"]["content"].strip()
                    if ans:
                        return ans
        except Exception as exc:
            logger.debug("Fast answer synthesis LLM call failed: %s; using deterministic synthesis.", exc)

    # 2. Deterministic answer synthesis fallback
    q_lower = question.lower()

    # Tools question
    if "tool" in q_lower:
        if tools:
            agent_str = f"The **{', '.join(sorted(agents))}** agent" if agents else "The agent"
            tool_list = ", ".join(f"`{t}`" for t in sorted(tools))
            return f"{agent_str} can access {len(tools)} tool(s): {tool_list}."
        return "No authorized tools were found for this agent in the governance graph."

    # Model question
    if "model" in q_lower:
        if models:
            agent_str = f"The **{', '.join(sorted(agents))}** agent" if agents else "The agent"
            return f"{agent_str} uses the **{', '.join(sorted(models))}** model."
        return "No foundation models were found for this agent in the governance graph."

    # Data source question
    if any(k in q_lower for k in ("data", "database", "datasource", "source")):
        if data_sources:
            return f"The agent has access to {len(data_sources)} data source(s): {', '.join(f'`{d}`' for d in sorted(data_sources))}."
        return "No accessible data sources were found in the governance graph."

    # Policy / Orphan question
    if "policy" in q_lower or "orphan" in q_lower:
        if "no policy" in q_lower or "without policy" in q_lower or "orphan" in q_lower:
            if agents:
                return f"The following agent(s) do not have a policy attached: {', '.join(f'`{a}`' for a in sorted(agents))}."
            return "All agents in the graph are governed by at least one policy."
        if policies:
            return f"The agent is governed by {len(policies)} policy/policies: {', '.join(f'`{p}`' for p in sorted(policies))}."

    # Blast radius question
    if "blast radius" in q_lower or "compromised" in q_lower:
        tool_str = f"`{next(iter(tools))}`" if tools else "the specified tool"
        return (
            f"If {tool_str} is compromised, the blast radius directly impacts: "
            f"Agents: {', '.join(f'`{a}`' for a in sorted(agents)) or 'None'}, "
            f"Users: {', '.join(f'`{u}`' for u in sorted(users)) or 'None'}, "
            f"DataSources: {', '.join(f'`{d}`' for d in sorted(data_sources)) or 'None'}."
        )

    # Overview / explain
    if any(k in q_lower for k in ("explain", "overview", "summary", "summarize", "describe", "all nodes")):
        parts = []
        if agents: parts.append(f"{len(agents)} Agent(s) ({', '.join(sorted(agents))})")
        if models: parts.append(f"{len(models)} Model(s) ({', '.join(sorted(models))})")
        if tools: parts.append(f"{len(tools)} Tool(s) ({', '.join(sorted(tools))})")
        if data_sources: parts.append(f"{len(data_sources)} DataSource(s) ({', '.join(sorted(data_sources))})")
        if policies: parts.append(f"{len(policies)} Policy/Policies ({', '.join(sorted(policies))})")
        if users: parts.append(f"{len(users)} User(s) ({', '.join(sorted(users))})")
        return f"Governance topology overview ({len(node_ids)} nodes): " + "; ".join(parts) + "."

    # General fallback
    if node_ids:
        all_names = sorted(list(tools | models | data_sources | policies | agents | users))[:5]
        return f"Found {len(node_ids)} matching node(s) in the graph: {', '.join(f'`{n}`' for n in all_names)}."

    return fallback_explanation


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
                        # Neo4j Path
                        elif hasattr(val, "nodes") and hasattr(val, "relationships"):
                            for p_node in val.nodes:
                                p_props = dict(p_node.items()) if hasattr(p_node, "items") else {}
                                p_nid = str(p_props.get("id") or getattr(p_node, "element_id", ""))
                                if p_nid:
                                    node_ids.add(p_nid)
                            for p_rel in val.relationships:
                                p_rprops = dict(p_rel.items()) if hasattr(p_rel, "items") else {}
                                p_rid = str(p_rprops.get("id") or getattr(p_rel, "element_id", ""))
                                if p_rid:
                                    edge_ids.add(p_rid)
                            rec_dict[key] = str(val)
                        # List or collection of elements
                        elif isinstance(val, list):
                            for item in val:
                                if hasattr(item, "labels") and hasattr(item, "items"):
                                    iprops = dict(item.items())
                                    inid = str(iprops.get("id") or getattr(item, "element_id", ""))
                                    if inid:
                                        node_ids.add(inid)
                                elif hasattr(item, "type") and hasattr(item, "nodes"):
                                    irprops = dict(item.items()) if hasattr(item, "items") else {}
                                    irid = str(irprops.get("id") or getattr(item, "element_id", ""))
                                    if irid:
                                        edge_ids.add(irid)
                            rec_dict[key] = val
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

    # If query returned zero direct node objects (e.g. scalar counts/aggregations), enrich from memory
    if not node_ids and _memory_nodes:
        mem_nodes, mem_edges, _ = _extract_highlights_from_memory(cleaned_question)
        node_ids.update(mem_nodes)
        edge_ids.update(mem_edges)

    # Synthesize a direct, natural-language answer using the actual query findings
    direct_answer = await synthesize_direct_answer(
        question=cleaned_question,
        records=records,
        node_ids=node_ids,
        fallback_explanation=explanation,
        model=model,
    )

    return QueryResult(
        question=cleaned_question,
        cypher=validated_cypher,
        explanation=direct_answer,
        highlight=QueryHighlight(
            node_ids=sorted(node_ids),
            edge_ids=sorted(edge_ids),
        ),
        records_count=len(records),
        raw_records=records[:50],  # Limit response payload size
    )
