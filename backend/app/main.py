"""Main FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context manager."""
    # Startup tasks
    yield
    # Shutdown tasks


def create_application() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    settings = get_settings()

    application = FastAPI(
        title="GovernIQ Governance Graph API",
        description="API service for AI Agent Governance Graph Builder",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Register centralized domain and validation exception handlers
    register_exception_handlers(application)

    # Configure CORS middleware
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Public health endpoints (no X-API-Key required)
    application.include_router(health_router, prefix="/api")
    application.include_router(health_router, prefix="")

    # Protected endpoints (X-API-Key enforced via router dependencies)
    application.include_router(auth_router, prefix="/api")

    return application


app = create_application()
