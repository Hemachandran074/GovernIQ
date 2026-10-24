"""Tests for authentication and X-API-Key dependency."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.main import app


@pytest.mark.asyncio
async def test_health_exempt_from_auth() -> None:
    """GET /api/health must be public and succeed without X-API-Key."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_root_health_exempt_from_auth() -> None:
    """GET /health must also succeed without X-API-Key."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_protected_route_without_key_returns_401() -> None:
    """Protected endpoints must return 401 when X-API-Key is missing."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth-check")
        assert response.status_code == 401
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "UNAUTHORIZED"
        assert "Missing X-API-Key header" in data["error"]["message"]


@pytest.mark.asyncio
async def test_protected_route_with_invalid_key_returns_401() -> None:
    """Protected endpoints must return 401 when X-API-Key is invalid."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth-check", headers={"X-API-Key": "wrong-secret-key"})
        assert response.status_code == 401
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "UNAUTHORIZED"
        assert "Invalid API key" in data["error"]["message"]


@pytest.mark.asyncio
async def test_protected_route_with_valid_key_returns_200() -> None:
    """Protected endpoints must return 200 when valid X-API-Key is provided."""
    settings = get_settings()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth-check", headers={"X-API-Key": settings.API_KEY})
        assert response.status_code == 200
        assert response.json() == {
            "authenticated": True,
            "message": "API key is valid",
        }
