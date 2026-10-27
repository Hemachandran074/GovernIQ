"""Normalized document model for parsed AI governance artifacts."""

from typing import Any

from pydantic import BaseModel, Field


class ParsedNode(BaseModel):
    """Normalized graph node entity."""

    id: str
    name: str
    type: str  # User, Agent, Model, Tool, DataSource, Policy
    source_doc: str | None = None
    props: dict[str, Any] = Field(default_factory=dict)


class ParsedEdge(BaseModel):
    """Normalized relationship between graph nodes."""

    id: str
    source: str  # Node ID
    target: str  # Node ID
    type: str  # OWNS, ACCESSES, USES, CAN_CALL, READS, WRITES, GOVERNED_BY
    props: dict[str, Any] = Field(default_factory=dict)


class ParsedDocument(BaseModel):
    """Complete set of nodes and edges extracted from an uploaded document."""

    source_doc: str
    nodes: list[ParsedNode] = Field(default_factory=list)
    edges: list[ParsedEdge] = Field(default_factory=list)
