"""Unit tests for document upload and graph retrieval API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.main import app


@pytest.mark.asyncio
async def test_upload_document_requires_api_key() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/documents",
            files={"file": ("agent.yaml", b"agent:\n  name: TestBot\n", "text/yaml")},
        )
        assert response.status_code == 401
        data = response.json()
        assert data["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_upload_valid_yaml_document() -> None:
    settings = get_settings()
    yaml_content = b"""agent:
  name: "Governance Bot"
  model: "claude-3-haiku"
  tools:
    - "Audit Tool"
"""
    headers = {"X-API-Key": settings.API_KEY}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/documents",
            files={"file": ("governance_bot.yaml", yaml_content, "text/yaml")},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert data["summary"]["nodes_processed"] >= 3
        assert "graph" in data
        assert data["graph"]["node_count"] >= 3


@pytest.mark.asyncio
async def test_upload_valid_jsonl_document() -> None:
    settings = get_settings()
    jsonl_content = (
        b'{"timestamp": "2024-10-28T10:00:00Z", "event": "model_invoke", "agent": "LogAgent", "model": "gpt-4o"}\n'
        b'{"timestamp": "2024-10-28T10:00:01Z", "event": "tool_call", "agent": "LogAgent", "tool": "LogSearchTool"}\n'
        b'{"timestamp": "2024-10-28T10:00:02Z", "event": "data_read", "agent": "LogAgent", "data_source": "LogDB"}\n'
    )
    headers = {"X-API-Key": settings.API_KEY}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/documents",
            files={"file": ("runtime.jsonl", jsonl_content, "application/jsonl")},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert data["summary"]["nodes_processed"] >= 4
        assert "graph" in data
        assert data["graph"]["node_count"] >= 4


@pytest.mark.asyncio
async def test_upload_unsupported_file_extension() -> None:
    settings = get_settings()
    headers = {"X-API-Key": settings.API_KEY}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/documents",
            files={"file": ("script.py", b"print('hello')", "text/x-python")},
            headers=headers,
        )
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "VALIDATION_ERROR"
        assert "Unsupported file format" in data["error"]["message"]


@pytest.mark.asyncio
async def test_get_graph_snapshot() -> None:
    settings = get_settings()
    headers = {"X-API-Key": settings.API_KEY}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/graph", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert "edges" in data
        assert "node_count" in data
        assert "edge_count" in data


@pytest.mark.asyncio
async def test_get_node_detail_success_and_not_found() -> None:
    settings = get_settings()
    headers = {"X-API-Key": settings.API_KEY}
    yaml_content = b"""agent:
  name: "Detail Agent"
  model: "claude-3-haiku"
  tools:
    - "Test Tool"
"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Ingest document first
        upload_res = await client.post(
            "/api/documents",
            files={"file": ("detail_agent.yaml", yaml_content, "text/yaml")},
            headers=headers,
        )
        assert upload_res.status_code == 200

        # Query existing node
        node_res = await client.get("/api/graph/nodes/Agent:detail-agent", headers=headers)
        assert node_res.status_code == 200
        data = node_res.json()
        assert data["node"]["name"] == "Detail Agent"
        assert data["node"]["type"] == "Agent"
        assert len(data["outbound"]) >= 2  # USES model + CAN_CALL tool
        assert data["total_neighbors"] >= 2

        # Query non-existent node
        missing_res = await client.get("/api/graph/nodes/Agent:non-existent", headers=headers)
        assert missing_res.status_code == 404
        assert missing_res.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_clear_graph_endpoint() -> None:
    settings = get_settings()
    headers = {"X-API-Key": settings.API_KEY}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Delete graph
        del_res = await client.delete("/api/graph", headers=headers)
        assert del_res.status_code == 200
        data = del_res.json()
        assert data["node_count"] == 0
        assert data["edge_count"] == 0
        assert "successfully cleared" in data["message"]

        # Confirm graph is now empty
        graph_res = await client.get("/api/graph", headers=headers)
        assert graph_res.status_code == 200
        assert graph_res.json()["node_count"] == 0
        assert graph_res.json()["edge_count"] == 0
