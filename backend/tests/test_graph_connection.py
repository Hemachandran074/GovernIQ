"""Tests for Neo4j connection pool management and lifecycle."""

from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import Settings
from app.graph.connection import Neo4jConnectionManager


@pytest.fixture
def mock_settings() -> Settings:
    return Settings(
        NEO4J_URI="bolt://localhost:7687",
        NEO4J_USER="neo4j_writer",
        NEO4J_PASSWORD="writer_password",
        NEO4J_READ_USER="neo4j_reader",
        NEO4J_READ_PASSWORD="reader_password",
    )


@patch("app.graph.connection.AsyncGraphDatabase.driver")
def test_connection_manager_initialization(mock_driver_factory, mock_settings: Settings) -> None:
    """Manager initializes distinct writer and reader drivers."""
    mock_writer = AsyncMock()
    mock_reader = AsyncMock()
    mock_driver_factory.side_effect = [mock_writer, mock_reader]

    manager = Neo4jConnectionManager()
    manager.initialize(mock_settings)

    assert manager.get_writer() is mock_writer
    assert manager.get_reader() is mock_reader

    # Check driver calls
    calls = mock_driver_factory.call_args_list
    assert len(calls) == 2

    # Writer call
    assert calls[0].args[0] == "bolt://localhost:7687"
    assert calls[0].kwargs["auth"] == ("neo4j_writer", "writer_password")

    # Reader call
    assert calls[1].args[0] == "bolt://localhost:7687"
    assert calls[1].kwargs["auth"] == ("neo4j_reader", "reader_password")


@pytest.mark.asyncio
@patch("app.graph.connection.AsyncGraphDatabase.driver")
async def test_connection_manager_verify_connectivity_success(
    mock_driver_factory, mock_settings: Settings
) -> None:
    """verify_connectivity returns True when both pools succeed."""
    mock_writer = AsyncMock()
    mock_reader = AsyncMock()
    mock_driver_factory.side_effect = [mock_writer, mock_reader]

    manager = Neo4jConnectionManager()
    manager.initialize(mock_settings)

    is_connected = await manager.verify_connectivity()
    assert is_connected is True
    mock_writer.verify_connectivity.assert_called_once()
    mock_reader.verify_connectivity.assert_called_once()


@pytest.mark.asyncio
@patch("app.graph.connection.AsyncGraphDatabase.driver")
async def test_connection_manager_verify_connectivity_failure(
    mock_driver_factory, mock_settings: Settings
) -> None:
    """verify_connectivity returns False when driver fails."""
    mock_writer = AsyncMock()
    mock_writer.verify_connectivity.side_effect = ConnectionRefusedError("Offline")
    mock_reader = AsyncMock()
    mock_driver_factory.side_effect = [mock_writer, mock_reader]

    manager = Neo4jConnectionManager()
    manager.initialize(mock_settings)

    is_connected = await manager.verify_connectivity()
    assert is_connected is False


@pytest.mark.asyncio
@patch("app.graph.connection.AsyncGraphDatabase.driver")
async def test_connection_manager_close(mock_driver_factory, mock_settings: Settings) -> None:
    """close shuts down both driver pools gracefully."""
    mock_writer = AsyncMock()
    mock_reader = AsyncMock()
    mock_driver_factory.side_effect = [mock_writer, mock_reader]

    manager = Neo4jConnectionManager()
    manager.initialize(mock_settings)

    await manager.close()
    mock_writer.close.assert_called_once()
    mock_reader.close.assert_called_once()
