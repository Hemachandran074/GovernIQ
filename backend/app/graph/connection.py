"""Neo4j asynchronous connection pool management for writer and read-only users."""

import logging

from neo4j import AsyncDriver, AsyncGraphDatabase
from neo4j.exceptions import ServiceUnavailable

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class Neo4jConnectionManager:
    """Singleton connection manager for Neo4j writer and reader drivers."""

    def __init__(self) -> None:
        self._writer_driver: AsyncDriver | None = None
        self._reader_driver: AsyncDriver | None = None

    def initialize(self, settings: Settings | None = None) -> None:
        """Initialize both writer and read-only connection pools."""
        if settings is None:
            settings = get_settings()

        uri = settings.NEO4J_URI

        # Writer Driver
        logger.info(
            "Initializing Neo4j writer connection to %s as user '%s'",
            uri,
            settings.NEO4J_USER,
        )
        self._writer_driver = AsyncGraphDatabase.driver(
            uri,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            connection_timeout=settings.NEO4J_CONNECTION_TIMEOUT,
        )

        # Reader Driver (Read-Only user role)
        read_user = settings.effective_read_user
        read_password = settings.effective_read_password
        logger.info(
            "Initializing Neo4j read-only connection to %s as user '%s'",
            uri,
            read_user,
        )
        self._reader_driver = AsyncGraphDatabase.driver(
            uri,
            auth=(read_user, read_password),
            connection_timeout=settings.NEO4J_CONNECTION_TIMEOUT,
        )

    def get_writer(self) -> AsyncDriver:
        """Return the writer driver instance for schema and ingestion."""
        if self._writer_driver is None:
            self.initialize()
        assert self._writer_driver is not None
        return self._writer_driver

    def get_reader(self) -> AsyncDriver:
        """Return the read-only driver instance for query execution."""
        if self._reader_driver is None:
            self.initialize()
        assert self._reader_driver is not None
        return self._reader_driver

    async def verify_connectivity(self) -> bool:
        """Check whether both Neo4j connection pools can establish a connection."""
        try:
            writer = self.get_writer()
            await writer.verify_connectivity()
            reader = self.get_reader()
            await reader.verify_connectivity()
            return True
        except (ServiceUnavailable, Exception) as exc:
            logger.warning("Neo4j connectivity check failed: %s", exc)
            return False

    async def close(self) -> None:
        """Gracefully close all active driver pools."""
        if self._writer_driver is not None:
            logger.info("Closing Neo4j writer driver...")
            await self._writer_driver.close()
            self._writer_driver = None

        if self._reader_driver is not None:
            logger.info("Closing Neo4j reader driver...")
            await self._reader_driver.close()
            self._reader_driver = None


_manager = Neo4jConnectionManager()


def init_neo4j_connections(settings: Settings | None = None) -> None:
    """Initialize global Neo4j driver pools."""
    _manager.initialize(settings)


def get_writer_driver() -> AsyncDriver:
    """Get active Neo4j writer driver."""
    return _manager.get_writer()


def get_reader_driver() -> AsyncDriver:
    """Get active Neo4j read-only driver."""
    return _manager.get_reader()


async def check_graph_connectivity() -> bool:
    """Ping Neo4j and return whether service is available."""
    return await _manager.verify_connectivity()


async def close_neo4j_connections() -> None:
    """Close active driver pools."""
    await _manager.close()
