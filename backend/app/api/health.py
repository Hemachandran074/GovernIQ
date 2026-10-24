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
