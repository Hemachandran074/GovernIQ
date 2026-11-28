"""Pytest fixtures for backend tests."""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.fixture(autouse=True)
def mock_neo4j_offline_in_tests():
    """Default unit tests to in-memory graph repository without attempting network connections."""
    with patch("app.graph.connection.check_graph_connectivity", new=AsyncMock(return_value=False)), \
         patch("app.main.check_graph_connectivity", new=AsyncMock(return_value=False)), \
         patch("app.services.ingestion.check_graph_connectivity", new=AsyncMock(return_value=False)), \
         patch("app.services.query.check_graph_connectivity", new=AsyncMock(return_value=False)), \
         patch("app.parsers.prose_extraction.extract_prose_via_llm", new=AsyncMock(return_value=None)), \
         patch("app.services.query.generate_cypher_and_explanation", side_effect=lambda question, model=None, effort="high": (
             "MATCH (a:Agent) WHERE NOT (a)-[:GOVERNED_BY]->(:Policy) RETURN a"
             if "no policy" in question.lower() or "orphan" in question.lower()
             else (
                 "MATCH (t:Tool)<-[:CAN_CALL]-(a:Agent)<-[:OWNS]-(u:User) RETURN t, a, u"
                 if "blast radius" in question.lower() or "compromised" in question.lower()
                 else "MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100"
             ),
             "Mock explanation"
         )):
        yield

