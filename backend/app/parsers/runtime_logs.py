"""Runtime log ingestion (Source B).

Parses JSONL runtime events from a sample agent run into observed usage.
Each recognized event contributes an edge tagged observed=True with an
occurrence count and a last_seen timestamp.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from app.core.errors import UnparseableDocumentError
from app.graph.identifiers import make_node_id
from app.parsers.models import ParsedDocument, ParsedEdge, ParsedNode

logger = logging.getLogger(__name__)

# Event mapping: event -> (node_type, rel_type, id_field, name_field)
EVENT_MAP: dict[str, tuple[str, str, str, str]] = {
    "model_invoke": ("Model", "USES", "model", "model_name"),
    "tool_call": ("Tool", "CAN_CALL", "tool", "tool_name"),
    "data_read": ("DataSource", "ACCESSES", "data_source", "data_source_name"),
    "data_write": ("DataSource", "ACCESSES", "data_source", "data_source_name"),
}


@dataclass
class _EdgeAgg:
    rel: str
    target_type: str
    target_id: str
    agent_id: str
    count: int = 0
    last_seen: str | None = None


def parse_runtime_logs(content: str, filename: str) -> ParsedDocument:
    """Parse JSONL runtime events into an observed ParsedDocument."""
    lines = content.strip().splitlines()
    if not lines:
        raise UnparseableDocumentError("Runtime log file is empty")

    agents: dict[str, str] = {}  # id -> name
    targets: dict[tuple[str, str], str] = {}  # (type, id) -> name
    edge_aggs: dict[tuple[str, str, str], _EdgeAgg] = {}

    for line_num, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            logger.warning("Skipping malformed log line %d: %s", line_num, exc)
            continue

        if not isinstance(record, dict):
            continue

        agent_id = record.get("agent_id") or record.get("agent")
        event = record.get("event")
        if not agent_id or event not in EVENT_MAP:
            continue

        agent_name = str(record.get("agent_name") or agent_id)
        agents[str(agent_id)] = agent_name

        node_type, rel_type, id_field, name_field = EVENT_MAP[event]
        target_id = record.get(id_field)
        if not target_id:
            continue

        target_name = str(record.get(name_field) or target_id)
        targets[(node_type, str(target_id))] = target_name

        key = (str(agent_id), rel_type, str(target_id))
        agg = edge_aggs.get(key)
        if agg is None:
            agg = _EdgeAgg(
                rel=rel_type,
                target_type=node_type,
                target_id=str(target_id),
                agent_id=str(agent_id),
            )
            edge_aggs[key] = agg

        agg.count += 1
        ts = record.get("timestamp")
        if ts and (agg.last_seen is None or str(ts) > agg.last_seen):
            agg.last_seen = str(ts)

    if not agents and not targets:
        raise UnparseableDocumentError("No valid runtime log events found in file")

    nodes_map: dict[str, ParsedNode] = {}
    edges_map: dict[str, ParsedEdge] = {}

    # Build agent nodes
    for a_id, a_name in agents.items():
        canonical_id = a_id
        nodes_map[canonical_id] = ParsedNode(
            id=canonical_id,
            name=a_name,
            type="Agent",
            source_doc=filename,
            props={"observed": True},
        )

    # Build target nodes (Model, Tool, DataSource)
    for (t_type, t_id), t_name in targets.items():
        canonical_id = t_id
        nodes_map[canonical_id] = ParsedNode(
            id=canonical_id,
            name=t_name,
            type=t_type,
            source_doc=filename,
            props={"observed": True},
        )

    # Build observed edges
    for (a_id, rel_type, t_id), agg in edge_aggs.items():
        edge_id = f"{a_id}-{rel_type}-{t_id}"
        edges_map[edge_id] = ParsedEdge(
            id=edge_id,
            source=a_id,
            target=t_id,
            type=rel_type,
            props={
                "observed": True,
                "observed_count": agg.count,
                "last_seen": agg.last_seen,
            },
        )

    return ParsedDocument(
        source_doc=filename,
        nodes=list(nodes_map.values()),
        edges=list(edges_map.values()),
    )
