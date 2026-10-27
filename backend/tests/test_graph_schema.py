"""Tests for Neo4j schema definitions and uniqueness constraints."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.graph.schema import (
    NODE_LABELS,
    RELATIONSHIP_TYPES,
    ensure_schema,
    get_constraint_query,
    get_index_query,
    verify_schema_constraints,
)


def test_schema_constants() -> None:
    """Verify all six canonical node labels and relationships exist."""
    assert set(NODE_LABELS) == {"User", "Agent", "Model", "Tool", "DataSource", "Policy"}
    assert "OWNS" in RELATIONSHIP_TYPES
    assert "ACCESSES" in RELATIONSHIP_TYPES
    assert "USES" in RELATIONSHIP_TYPES
    assert "CAN_CALL" in RELATIONSHIP_TYPES
    assert "READS" in RELATIONSHIP_TYPES
    assert "WRITES" in RELATIONSHIP_TYPES
    assert "GOVERNED_BY" in RELATIONSHIP_TYPES


def test_constraint_query_generation() -> None:
    """Uniqueness constraint queries must adhere to Neo4j 5 syntax for all labels."""
    for label in NODE_LABELS:
        query = get_constraint_query(label)
        assert f"constraint_{label.lower()}_id" in query
        assert f"FOR (n:{label})" in query
        assert "REQUIRE n.id IS UNIQUE" in query


def test_index_query_generation() -> None:
    """Index queries must adhere to Neo4j 5 syntax for all labels."""
    for label in NODE_LABELS:
        query = get_index_query(label)
        assert f"index_{label.lower()}_name" in query
        assert f"FOR (n:{label})" in query
        assert "ON (n.name)" in query


@pytest.mark.asyncio
async def test_ensure_schema_executes_all_ddl() -> None:
    """ensure_schema must run 6 uniqueness constraints and 6 indexes."""
    mock_session = AsyncMock()
    mock_driver = MagicMock()
    mock_driver.session.return_value.__aenter__.return_value = mock_session

    await ensure_schema(mock_driver, database="neo4j")

    assert mock_session.run.call_count == len(NODE_LABELS) * 2

    executed_queries = [call.args[0] for call in mock_session.run.call_args_list]

    for label in NODE_LABELS:
        assert any(f"FOR (n:{label}) REQUIRE n.id IS UNIQUE" in q for q in executed_queries)
        assert any(f"FOR (n:{label}) ON (n.name)" in q for q in executed_queries)


@pytest.mark.asyncio
async def test_verify_schema_constraints() -> None:
    """verify_schema_constraints parses SHOW CONSTRAINTS results."""
    mock_session = AsyncMock()
    mock_driver = MagicMock()
    mock_driver.session.return_value.__aenter__.return_value = mock_session

    async def mock_records():
        yield {"name": "constraint_user_id"}
        yield {"name": "constraint_agent_id"}

    mock_result = MagicMock()
    mock_result.__aiter__ = lambda self: mock_records()
    mock_session.run.return_value = mock_result

    constraints = await verify_schema_constraints(mock_driver, database="neo4j")

    assert constraints == ["constraint_user_id", "constraint_agent_id"]
