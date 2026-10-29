"""Unit and integration tests for query endpoints and LLM translation."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.main import app
from app.services.ingestion import ingest_document


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Return valid X-API-Key header."""
    settings = get_settings()
    return {"X-API-Key": settings.API_KEY}


@pytest.mark.asyncio
async def test_get_models_unauthorized() -> None:
    """GET /api/models must require authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/models")
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_models_authorized(auth_headers: dict[str, str]) -> None:
    """GET /api/models returns available models including default."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/models", headers=auth_headers)
        assert resp.status_code == 200
        models = resp.json()
        assert len(models) >= 3
        model_ids = [m["id"] for m in models]
        assert "llama-3.3-70b-versatile" in model_ids
        assert "openai/gpt-oss-120b" in model_ids
        assert any(m["default"] for m in models)


@pytest.mark.asyncio
async def test_query_orphan_agents(auth_headers: dict[str, str]) -> None:
    """POST /api/query correctly identifies orphan agents."""
    sample_doc = """{
      "nodes": [
        {"id": "agent-orphan", "name": "Orphan Agent", "type": "Agent"},
        {"id": "agent-safe", "name": "Compliant Agent", "type": "Agent"},
        {"id": "pol-sec", "name": "Security Policy", "type": "Policy"}
      ],
      "edges": [
        {"id": "e1", "source": "agent-safe", "target": "pol-sec", "type": "GOVERNED_BY"}
      ]
    }"""
    await ingest_document("orphan_test.json", sample_doc)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/query",
            headers=auth_headers,
            json={"question": "Is there any agent with no policy attached?", "effort": "high"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "cypher" in data
        assert "RETURN" in data["cypher"]
        assert "Agent:orphan-agent" in data["highlight"]["node_ids"] or "agent-orphan" in data["highlight"]["node_ids"]
        assert "Agent:compliant-agent" not in data["highlight"]["node_ids"]


@pytest.mark.asyncio
async def test_query_tool_blast_radius(auth_headers: dict[str, str]) -> None:
    """POST /api/query calculates blast radius for compromised tool."""
    sample_doc = """{
      "nodes": [
        {"id": "usr-admin", "name": "Alice Admin", "type": "User"},
        {"id": "agent-bot", "name": "Payment Bot", "type": "Agent"},
        {"id": "tool-sqli", "name": "SQL Executor", "type": "Tool"}
      ],
      "edges": [
        {"id": "e1", "source": "usr-admin", "target": "agent-bot", "type": "OWNS"},
        {"id": "e2", "source": "agent-bot", "target": "tool-sqli", "type": "CAN_CALL"}
      ]
    }"""
    await ingest_document("blast_radius_test.json", sample_doc)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/query",
            headers=auth_headers,
            json={"question": "What is the blast radius of compromised tool SQL Executor?"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "Tool:sql-executor" in data["highlight"]["node_ids"] or "tool-sqli" in data["highlight"]["node_ids"]
        assert "Agent:payment-bot" in data["highlight"]["node_ids"] or "agent-bot" in data["highlight"]["node_ids"]
        assert "User:alice-admin" in data["highlight"]["node_ids"] or "usr-admin" in data["highlight"]["node_ids"]
