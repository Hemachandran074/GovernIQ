"""Tests for CORS middleware configuration."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_cors_allowed_origin() -> None:
    """Preflight request from allowed origin returns Access-Control-Allow-Origin."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


@pytest.mark.asyncio
async def test_cors_disallowed_origin() -> None:
    """Preflight request from disallowed origin does not return Access-Control-Allow-Origin."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.options(
            "/api/health",
            headers={
                "Origin": "http://malicious-website.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-origin") is None
