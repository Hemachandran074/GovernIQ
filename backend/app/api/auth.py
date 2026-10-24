"""Authentication verification endpoint."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import verify_api_key

router = APIRouter(tags=["Auth"], dependencies=[Depends(verify_api_key)])


class AuthCheckResponse(BaseModel):
    """Response returned when API key authentication succeeds."""

    authenticated: bool = True
    message: str = "API key is valid"


@router.get("/auth-check", response_model=AuthCheckResponse)
async def auth_check() -> AuthCheckResponse:
    """Verify that client possesses a valid X-API-Key."""
    return AuthCheckResponse(authenticated=True, message="API key is valid")
