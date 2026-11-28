"""Health check endpoint router."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    """Health check response schema."""

    status: str = "ok"


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return health status of the API service."""
    return HealthResponse(status="ok")


@router.get("/", response_model=dict[str, str])
async def root() -> dict[str, str]:
    """Root endpoint welcoming clients and confirming API is alive."""
    return {
        "status": "ok",
        "service": "GovernIQ Governance Graph API",
        "health": "/health",
        "docs": "/docs",
    }
