"""API key authentication dependency."""

import secrets

from fastapi import Security
from fastapi.security import APIKeyHeader

from app.core.config import get_settings
from app.core.errors import AuthenticationError

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(
    api_key: str | None = Security(api_key_header),
) -> str:
    """Verify that the incoming X-API-Key matches the configured API_KEY.

    Raises:
        AuthenticationError: If the key is missing or invalid (maps to 401).
    """
    if not api_key:
        raise AuthenticationError("Missing X-API-Key header")

    settings = get_settings()
    # Constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(api_key, settings.API_KEY):
        raise AuthenticationError("Invalid API key")

    return api_key
