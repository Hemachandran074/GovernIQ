"""Main FastAPI application entry point."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.api.health import router as health_router
from app.api.query import router as query_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.graph.connection import (
    check_graph_connectivity,
    close_neo4j_connections,
    get_writer_driver,
    init_neo4j_connections,
)
from app.graph.schema import ensure_schema

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context manager managing database pools."""
    settings = get_settings()
    logger.info("Starting up GovernIQ backend...")

    # Initialize Neo4j connection pools (writer & reader)
    init_neo4j_connections(settings)

    # Check connectivity and initialize schema uniqueness constraints if live
    is_live = await check_graph_connectivity()
    if is_live:
        try:
            await ensure_schema(get_writer_driver(), database=settings.NEO4J_DATABASE)
        except Exception as exc:
            logger.warning("Failed to verify/create schema constraints on startup: %s", exc)
    else:
        logger.info(
            "Neo4j database (%s) is not reachable at startup; "
            "constraints will be ensured upon first write.",
            settings.NEO4J_URI,
        )

    yield

    # Clean shutdown
    logger.info("Shutting down GovernIQ backend and closing database pools...")
    await close_neo4j_connections()


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
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Public health endpoints (no X-API-Key required)
    application.include_router(health_router, prefix="/api")
    application.include_router(health_router, prefix="")

    # Protected endpoints (X-API-Key enforced via router dependencies)
    application.include_router(auth_router, prefix="/api")
    application.include_router(documents_router, prefix="/api")
    application.include_router(query_router, prefix="/api")

    return application


app = create_application()
