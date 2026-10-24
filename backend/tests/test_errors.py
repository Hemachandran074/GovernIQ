"""Tests for centralized exception handlers and error response envelope."""

import pytest
from fastapi import APIRouter
from httpx import ASGITransport, AsyncClient

from app.core.errors import (
    NotFoundError,
    PayloadTooLargeError,
    UnparseableDocumentError,
    UpstreamServiceError,
    ValidationError,
)
from app.main import app

error_endpoint_router = APIRouter(prefix="/api/test-errors", tags=["TestErrors"])


@error_endpoint_router.get("/validation")
async def trigger_validation_error() -> None:
    raise ValidationError("Custom validation failure")


@error_endpoint_router.get("/not-found")
async def trigger_not_found_error() -> None:
    raise NotFoundError("Entity with id X does not exist")


@error_endpoint_router.get("/payload-too-large")
async def trigger_payload_too_large() -> None:
    raise PayloadTooLargeError("File exceeds 2 MB limit")


@error_endpoint_router.get("/unparseable")
async def trigger_unparseable_document() -> None:
    raise UnparseableDocumentError("Invalid YAML syntax at line 4")


@error_endpoint_router.get("/upstream")
async def trigger_upstream_error() -> None:
    raise UpstreamServiceError("Neo4j connection refused")


@error_endpoint_router.get("/unhandled")
async def trigger_unhandled_error() -> None:
    raise RuntimeError("Simulated crash")


# Mount test routes
app.include_router(error_endpoint_router)


@pytest.mark.asyncio
async def test_validation_error_shape() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/test-errors/validation")
        assert response.status_code == 400
        assert response.json() == {
            "error": {"code": "VALIDATION_ERROR", "message": "Custom validation failure"}
        }


@pytest.mark.asyncio
async def test_not_found_error_shape() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/test-errors/not-found")
        assert response.status_code == 404
        assert response.json() == {
            "error": {"code": "NOT_FOUND", "message": "Entity with id X does not exist"}
        }


@pytest.mark.asyncio
async def test_payload_too_large_error_shape() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/test-errors/payload-too-large")
        assert response.status_code == 413
        assert response.json() == {
            "error": {"code": "PAYLOAD_TOO_LARGE", "message": "File exceeds 2 MB limit"}
        }


@pytest.mark.asyncio
async def test_unparseable_document_error_shape() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/test-errors/unparseable")
        assert response.status_code == 422
        assert response.json() == {
            "error": {"code": "UNPARSEABLE_DOCUMENT", "message": "Invalid YAML syntax at line 4"}
        }


@pytest.mark.asyncio
async def test_upstream_service_error_shape() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/test-errors/upstream")
        assert response.status_code == 502
        assert response.json() == {
            "error": {"code": "UPSTREAM_ERROR", "message": "Neo4j connection refused"}
        }


@pytest.mark.asyncio
async def test_unhandled_exception_returns_500_without_stacktrace() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.get("/api/test-errors/unhandled")
        assert response.status_code == 500
        assert response.json() == {
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected internal error occurred.",
            }
        }
