"""Graph persistence repository for idempotent upserts and queries."""

import logging
from typing import Any

from neo4j import AsyncDriver

from app.graph.schema import NODE_LABELS, RELATIONSHIP_TYPES
from app.parsers.models import ParsedDocument

logger = logging.getLogger(__name__)


async def upsert_document_graph(
    driver: AsyncDriver, doc: ParsedDocument, database: str = "neo4j"
) -> tuple[int, int]:
    """Idempotently upsert nodes and edges from a ParsedDocument into Neo4j using MERGE."""
    nodes_upserted = 0
    edges_upserted = 0
    new_node_ids = [n.id for n in doc.nodes]

    async with driver.session(database=database) as session:
        # Prune previous relationships for this document to handle configuration modifications
        await session.run(
            "MATCH ()-[r]->() WHERE r.source_doc = $source_doc DELETE r",
            source_doc=doc.source_doc,
        )

        # Prune nodes that were created by this document and removed in the updated config
        await session.run(
            "MATCH (n) WHERE n.source_doc = $source_doc AND NOT n.id IN $new_node_ids "
            "DETACH DELETE n",
            source_doc=doc.source_doc,
            new_node_ids=new_node_ids,
        )

        # 1. Upsert Nodes
        for node in doc.nodes:
            label = node.type if node.type in NODE_LABELS else "Agent"
            query = (
                f"MERGE (n:{label} {{id: $id}}) "
                "ON CREATE SET n.name = $name, n.type = $type, "
                "n.source_doc = $source_doc, n += $props "
                "ON MATCH SET n.name = $name, n.source_doc = $source_doc, n += $props "
                "RETURN n.id"
            )
            await session.run(
                query,
                id=node.id,
                name=node.name,
                type=node.type,
                source_doc=node.source_doc or doc.source_doc,
                props=node.props,
            )
            nodes_upserted += 1

        # 2. Upsert Edges
        for edge in doc.edges:
            rel_type = edge.type if edge.type in RELATIONSHIP_TYPES else "GOVERNED_BY"
            query = (
                "MATCH (s {id: $source_id}) "
                "MATCH (t {id: $target_id}) "
                f"MERGE (s)-[r:{rel_type}]->(t) "
                "ON CREATE SET r.id = $id, r.source_doc = $source_doc, r += $props "
                "ON MATCH SET r.source_doc = $source_doc, r += $props "
                "RETURN r.id"
            )
            result = await session.run(
                query,
                source_id=edge.source,
                target_id=edge.target,
                id=edge.id,
                source_doc=doc.source_doc,
                props=edge.props,
            )
            record = await result.single()
            if record:
                edges_upserted += 1

    return nodes_upserted, edges_upserted


async def fetch_full_graph(driver: AsyncDriver, database: str = "neo4j") -> dict[str, Any]:
    """Retrieve full graph snapshot (all nodes and edges with counts)."""
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    async with driver.session(database=database) as session:
        # Query all nodes
        node_result = await session.run(
            "MATCH (n) "
            "RETURN n.id AS id, n.name AS name, n.type AS type, "
            "n.source_doc AS source_doc, properties(n) AS props"
        )
        async for record in node_result:
            props = {
                k: v
                for k, v in (record.get("props") or {}).items()
                if k not in ("id", "name", "type", "source_doc")
            }
            nodes.append(
                {
                    "id": record.get("id"),
                    "name": record.get("name") or record.get("id"),
                    "type": record.get("type") or "Agent",
                    "source_doc": record.get("source_doc"),
                    "props": props,
                }
            )

        # Query all relationships
        edge_result = await session.run(
            "MATCH (s)-[r]->(t) "
            "RETURN coalesce(r.id, s.id + '-' + type(r) + '-' + t.id) AS id, "
            "s.id AS source, t.id AS target, type(r) AS type, properties(r) AS props, "
            "coalesce(r.source_doc, s.source_doc) AS source_doc"
        )
        async for record in edge_result:
            edges.append(
                {
                    "id": record.get("id"),
                    "source": record.get("source"),
                    "target": record.get("target"),
                    "type": record.get("type"),
                    "source_doc": record.get("source_doc"),
                    "props": record.get("props") or {},
                }
            )

    return {
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


async def clear_graph(driver: AsyncDriver, database: str = "neo4j") -> None:
    """Delete all nodes and relationships (for development / testing)."""
    async with driver.session(database=database) as session:
        await session.run("MATCH (n) DETACH DELETE n")


async def fetch_node_neighbors(
    driver: AsyncDriver, node_id: str, database: str = "neo4j"
) -> dict[str, Any] | None:
    """Retrieve node details and immediate inbound and outbound neighbors."""
    async with driver.session(database=database) as session:
        # Check node exists
        node_result = await session.run(
            "MATCH (n {id: $node_id}) "
            "RETURN n.id AS id, n.name AS name, n.type AS type, "
            "n.source_doc AS source_doc, properties(n) AS props",
            node_id=node_id,
        )
        record = await node_result.single()
        if not record:
            return None

        node_props = {
            k: v
            for k, v in (record.get("props") or {}).items()
            if k not in ("id", "name", "type", "source_doc")
        }
        node_data = {
            "id": record.get("id"),
            "name": record.get("name") or record.get("id"),
            "type": record.get("type") or "Agent",
            "source_doc": record.get("source_doc"),
            "props": node_props,
        }

        # Outbound relationships: (n)-[r]->(target)
        outbound: list[dict[str, Any]] = []
        outbound_result = await session.run(
            "MATCH (n {id: $node_id})-[r]->(target) "
            "RETURN coalesce(r.id, n.id + '-' + type(r) + '-' + target.id) AS edge_id, "
            "type(r) AS rel_type, properties(r) AS edge_props, "
            "target.id AS target_id, target.name AS target_name, "
            "target.type AS target_type, target.source_doc AS target_source_doc, "
            "properties(target) AS target_props",
            node_id=node_id,
        )
        async for r in outbound_result:
            t_props = {
                k: v
                for k, v in (r.get("target_props") or {}).items()
                if k not in ("id", "name", "type", "source_doc")
            }
            outbound.append(
                {
                    "edge_id": r.get("edge_id"),
                    "rel_type": r.get("rel_type"),
                    "direction": "outbound",
                    "props": r.get("edge_props") or {},
                    "neighbor": {
                        "id": r.get("target_id"),
                        "name": r.get("target_name") or r.get("target_id"),
                        "type": r.get("target_type") or "Agent",
                        "source_doc": r.get("target_source_doc"),
                        "props": t_props,
                    },
                }
            )

        # Inbound relationships: (source)-[r]->(n)
        inbound: list[dict[str, Any]] = []
        inbound_result = await session.run(
            "MATCH (source)-[r]->(n {id: $node_id}) "
            "RETURN coalesce(r.id, source.id + '-' + type(r) + '-' + n.id) AS edge_id, "
            "type(r) AS rel_type, properties(r) AS edge_props, "
            "source.id AS source_id, source.name AS source_name, "
            "source.type AS source_type, source.source_doc AS source_source_doc, "
            "properties(source) AS source_props",
            node_id=node_id,
        )
        async for r in inbound_result:
            s_props = {
                k: v
                for k, v in (r.get("source_props") or {}).items()
                if k not in ("id", "name", "type", "source_doc")
            }
            inbound.append(
                {
                    "edge_id": r.get("edge_id"),
                    "rel_type": r.get("rel_type"),
                    "direction": "inbound",
                    "props": r.get("edge_props") or {},
                    "neighbor": {
                        "id": r.get("source_id"),
                        "name": r.get("source_name") or r.get("source_id"),
                        "type": r.get("source_type") or "Agent",
                        "source_doc": r.get("source_source_doc"),
                        "props": s_props,
                    },
                }
            )

        return {
            "node": node_data,
            "inbound": inbound,
            "outbound": outbound,
            "total_neighbors": len(inbound) + len(outbound),
        }
