"""Ingestion service coordinating document parsing, graph upsert, and snapshot return."""

import logging
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.graph.connection import check_graph_connectivity, get_writer_driver
from app.graph.repository import (
    clear_graph,
    fetch_full_graph,
    fetch_node_neighbors,
    upsert_document_graph,
)
from app.graph.schema import ensure_schema
from app.parsers import parse_document_async
from app.parsers.models import ParsedDocument

logger = logging.getLogger(__name__)

# In-memory graph cache (used for resilient local testing or offline demo fallback)
_memory_nodes: dict[str, dict[str, Any]] = {}
_memory_edges: dict[str, dict[str, Any]] = {}


class IngestionSummary(BaseModel):
    """Summary of ingested graph entities."""

    nodes_processed: int
    edges_processed: int
    source_doc: str


class DocumentSummary(BaseModel):
    """Summary of an ingested agent config or governance document."""

    filename: str
    agents: list[str] = Field(default_factory=list)
    node_count: int
    edge_count: int


class GraphSnapshot(BaseModel):
    """Complete graph state after ingestion."""

    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    node_count: int
    edge_count: int


class IngestionResponse(BaseModel):
    """API response envelope for document upload."""

    summary: IngestionSummary
    graph: GraphSnapshot


class NeighborNode(BaseModel):
    """Neighbor node details."""

    id: str
    name: str
    type: str
    source_doc: str | None = None
    props: dict[str, Any] = Field(default_factory=dict)


class NeighborLink(BaseModel):
    """Edge connection to a neighbor node."""

    edge_id: str
    rel_type: str
    direction: str  # "inbound" | "outbound"
    props: dict[str, Any] = Field(default_factory=dict)
    neighbor: NeighborNode


class NodeDetailResponse(BaseModel):
    """Comprehensive details of a node and its neighborhood."""

    node: NeighborNode
    inbound: list[NeighborLink] = Field(default_factory=list)
    outbound: list[NeighborLink] = Field(default_factory=list)
    total_neighbors: int


class ClearGraphResponse(BaseModel):
    """Result of clearing graph store."""

    message: str
    node_count: int
    edge_count: int


def _update_memory_graph(doc: ParsedDocument) -> GraphSnapshot:
    """Update in-memory graph cache when Neo4j is offline or during testing."""
    new_edge_ids = {e.id for e in doc.edges}

    # 1. Reconcile previous edges for this document to handle configuration modifications
    for eid in list(_memory_edges.keys()):
        if _memory_edges[eid].get("source_doc") == doc.source_doc and eid not in new_edge_ids:
            edge_props = _memory_edges[eid].setdefault("props", {})
            if edge_props.get("observed"):
                # Was also observed at runtime; keep observation and mark declared=False (drift)
                edge_props["declared"] = False
            else:
                del _memory_edges[eid]

    # 2. Prune previous nodes belonging to this document that were removed in the updated config
    new_node_ids = {n.id for n in doc.nodes}
    for nid in list(_memory_nodes.keys()):
        if _memory_nodes[nid].get("source_doc") == doc.source_doc and nid not in new_node_ids:
            if not _memory_nodes[nid].get("props", {}).get("observed"):
                del _memory_nodes[nid]

    # 3. Upsert current nodes
    for n in doc.nodes:
        if n.id in _memory_nodes:
            _memory_nodes[n.id].setdefault("props", {}).update(n.props)
        else:
            _memory_nodes[n.id] = {
                "id": n.id,
                "name": n.name,
                "type": n.type,
                "source_doc": n.source_doc or doc.source_doc,
                "props": dict(n.props),
            }

    # 4. Upsert current edges
    for e in doc.edges:
        if e.id in _memory_edges:
            existing_props = _memory_edges[e.id].setdefault("props", {})
            existing_props.update(e.props)
            if e.props.get("declared"):
                existing_props["declared"] = True
            if e.props.get("observed"):
                existing_props["observed"] = True
                if "observed_count" in e.props:
                    existing_props["observed_count"] = e.props["observed_count"]
                if "last_seen" in e.props:
                    existing_props["last_seen"] = e.props["last_seen"]
        else:
            _memory_edges[e.id] = {
                "id": e.id,
                "source": e.source,
                "target": e.target,
                "type": e.type,
                "source_doc": doc.source_doc,
                "props": dict(e.props),
            }

    return GraphSnapshot(
        nodes=list(_memory_nodes.values()),
        edges=list(_memory_edges.values()),
        node_count=len(_memory_nodes),
        edge_count=len(_memory_edges),
    )


async def ingest_document(filename: str, content: str) -> IngestionResponse:
    """Parse document, upsert into Neo4j (or fallback cache), and return updated graph."""
    settings = get_settings()
    parsed_doc = await parse_document_async(content, filename)

    is_connected = await check_graph_connectivity()
    if is_connected:
        driver = get_writer_driver()
        # Ensure schema constraints exist before writing
        await ensure_schema(driver, database=settings.NEO4J_DATABASE)
        nodes_upserted, edges_upserted = await upsert_document_graph(
            driver, parsed_doc, database=settings.NEO4J_DATABASE
        )
        full_graph_dict = await fetch_full_graph(driver, database=settings.NEO4J_DATABASE)
        snapshot = GraphSnapshot(
            nodes=full_graph_dict["nodes"],
            edges=full_graph_dict["edges"],
            node_count=full_graph_dict["node_count"],
            edge_count=full_graph_dict["edge_count"],
        )
    else:
        logger.warning("Neo4j offline; buffering document into in-memory store.")
        nodes_upserted = len(parsed_doc.nodes)
        edges_upserted = len(parsed_doc.edges)
        snapshot = _update_memory_graph(parsed_doc)

    summary = IngestionSummary(
        nodes_processed=nodes_upserted,
        edges_processed=edges_upserted,
        source_doc=parsed_doc.source_doc,
    )

    return IngestionResponse(summary=summary, graph=snapshot)


async def get_current_graph() -> GraphSnapshot:
    """Fetch current graph from Neo4j or memory store."""
    settings = get_settings()
    is_connected = await check_graph_connectivity()
    if is_connected:
        driver = get_writer_driver()
        data = await fetch_full_graph(driver, database=settings.NEO4J_DATABASE)
        return GraphSnapshot(**data)

    return GraphSnapshot(
        nodes=list(_memory_nodes.values()),
        edges=list(_memory_edges.values()),
        node_count=len(_memory_nodes),
        edge_count=len(_memory_edges),
    )


async def get_document_summaries() -> list[DocumentSummary]:
    """List all ingested documents with their agent names, node counts, and edge counts."""
    current = await get_current_graph()
    docs_map: dict[str, dict[str, Any]] = {}

    for node in current.nodes:
        doc_name = node.get("source_doc") or "unknown"
        if doc_name not in docs_map:
            docs_map[doc_name] = {"filename": doc_name, "agents": set(), "nodes": 0, "edges": 0}
        docs_map[doc_name]["nodes"] += 1
        if node.get("type") == "Agent":
            docs_map[doc_name]["agents"].add(str(node.get("name") or node.get("id")))

    for edge in current.edges:
        doc_name = edge.get("source_doc")
        if not doc_name:
            # Infer source_doc from source node
            source_id = edge.get("source")
            matching_node = next((n for n in current.nodes if n.get("id") == source_id), None)
            doc_name = matching_node.get("source_doc") if matching_node else "unknown"
        if doc_name and doc_name in docs_map:
            docs_map[doc_name]["edges"] += 1

    return [
        DocumentSummary(
            filename=d["filename"],
            agents=sorted(d["agents"]),
            node_count=d["nodes"],
            edge_count=d["edges"],
        )
        for d in docs_map.values()
    ]


async def get_node_detail(node_id: str) -> NodeDetailResponse | None:
    """Fetch details and neighbors for a single node."""
    settings = get_settings()
    is_connected = await check_graph_connectivity()
    if is_connected:
        driver = get_writer_driver()
        raw_data = await fetch_node_neighbors(driver, node_id, database=settings.NEO4J_DATABASE)
        if raw_data:
            return NodeDetailResponse(**raw_data)
        return None

    # Offline memory fallback
    if node_id not in _memory_nodes:
        return None

    node_dict = _memory_nodes[node_id]
    target_node = NeighborNode(**node_dict)

    inbound: list[NeighborLink] = []
    outbound: list[NeighborLink] = []

    for e in _memory_edges.values():
        if e["source"] == node_id and e["target"] in _memory_nodes:
            neighbor = NeighborNode(**_memory_nodes[e["target"]])
            outbound.append(
                NeighborLink(
                    edge_id=e["id"],
                    rel_type=e["type"],
                    direction="outbound",
                    props=e.get("props", {}),
                    neighbor=neighbor,
                )
            )
        elif e["target"] == node_id and e["source"] in _memory_nodes:
            neighbor = NeighborNode(**_memory_nodes[e["source"]])
            inbound.append(
                NeighborLink(
                    edge_id=e["id"],
                    rel_type=e["type"],
                    direction="inbound",
                    props=e.get("props", {}),
                    neighbor=neighbor,
                )
            )

    return NodeDetailResponse(
        node=target_node,
        inbound=inbound,
        outbound=outbound,
        total_neighbors=len(inbound) + len(outbound),
    )


async def delete_graph() -> ClearGraphResponse:
    """Clear all nodes and relationships from graph database and memory cache."""
    settings = get_settings()
    is_connected = await check_graph_connectivity()
    if is_connected:
        driver = get_writer_driver()
        await clear_graph(driver, database=settings.NEO4J_DATABASE)

    _memory_nodes.clear()
    _memory_edges.clear()

    return ClearGraphResponse(
        message="Graph successfully cleared",
        node_count=0,
        edge_count=0,
    )
