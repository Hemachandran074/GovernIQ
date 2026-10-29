"""Pytest fixtures for backend tests."""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.fixture(autouse=True)
def mock_neo4j_offline_in_tests():
    """Default unit tests to in-memory graph repository without attempting network connections."""
    with patch("app.graph.connection.check_graph_connectivity", new=AsyncMock(return_value=False)), \
         patch("app.main.check_graph_connectivity", new=AsyncMock(return_value=False)), \
         patch("app.services.ingestion.check_graph_connectivity", new=AsyncMock(return_value=False)):
        yield

