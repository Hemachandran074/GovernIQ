"""Neo4j schema definitions, uniqueness constraints, and index management."""

import logging
from typing import Final

from neo4j import AsyncDriver

logger = logging.getLogger(__name__)

# Six canonical node labels defined in architecture.md
NODE_LABELS: Final[tuple[str, ...]] = (
    "User",
    "Agent",
    "Model",
    "Tool",
    "DataSource",
    "Policy",
)

# Relationship types defined in ontology
RELATIONSHIP_TYPES: Final[tuple[str, ...]] = (
    "OWNS",
    "ACCESSES",
    "USES",
    "USES_MODEL",
    "CAN_CALL",
    "HAS_TOOL",
    "READS",
    "READS_FROM",
    "WRITES",
    "GOVERNED_BY",
    "APPLIES_TO",
)


def get_constraint_query(label: str) -> str:
    """Return Cypher statement creating a uniqueness constraint on id for the given label."""
    constraint_name = f"constraint_{label.lower()}_id"
    return (
        f"CREATE CONSTRAINT {constraint_name} IF NOT EXISTS FOR (n:{label}) REQUIRE n.id IS UNIQUE"
    )


def get_index_query(label: str) -> str:
    """Return Cypher statement creating an index on name for the given label."""
    index_name = f"index_{label.lower()}_name"
    return f"CREATE INDEX {index_name} IF NOT EXISTS FOR (n:{label}) ON (n.name)"


async def ensure_schema(driver: AsyncDriver, database: str = "neo4j") -> None:
    """Ensure all mandatory uniqueness constraints and indexes exist in Neo4j.

    Creates uniqueness constraints on the `id` field for:
    - User
    - Agent
    - Model
    - Tool
    - DataSource
    - Policy

    And creates lookup indexes on the `name` field for efficient queries.
    """
    logger.info("Ensuring Neo4j schema uniqueness constraints on database '%s'...", database)

    async with driver.session(database=database) as session:
        # Create uniqueness constraints for all node labels
        for label in NODE_LABELS:
            query = get_constraint_query(label)
            logger.debug("Executing schema DDL: %s", query)
            await session.run(query)

        # Create name lookup indexes
        for label in NODE_LABELS:
            query = get_index_query(label)
            logger.debug("Executing index DDL: %s", query)
            await session.run(query)

    logger.info("Neo4j schema uniqueness constraints successfully verified.")


async def verify_schema_constraints(driver: AsyncDriver, database: str = "neo4j") -> list[str]:
    """Retrieve all existing constraint names from the Neo4j instance."""
    constraints: list[str] = []
    async with driver.session(database=database) as session:
        result = await session.run("SHOW CONSTRAINTS")
        async for record in result:
            name = record.get("name")
            if name:
                constraints.append(str(name))
    return constraints
