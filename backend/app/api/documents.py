"""Document ingestion and graph endpoints."""

import os

from fastapi import APIRouter, Depends, File, UploadFile

from app.core.auth import verify_api_key
from app.core.config import get_settings
from app.core.errors import NotFoundError, PayloadTooLargeError, ValidationError
from app.services.ingestion import (
    ClearGraphResponse,
    DocumentSummary,
    GraphSnapshot,
    IngestionResponse,
    NodeDetailResponse,
    delete_graph,
    get_current_graph,
    get_document_summaries,
    get_node_detail,
    ingest_document,
)

router = APIRouter(tags=["Documents & Graph"], dependencies=[Depends(verify_api_key)])

ALLOWED_EXTENSIONS = {".json", ".yaml", ".yml", ".md", ".markdown"}


@router.post("/documents", response_model=IngestionResponse)
async def upload_document(
    file: UploadFile = File(...),
) -> IngestionResponse:
    """Upload and ingest an AI governance document (MD, YAML, or JSON)."""
    filename = file.filename or "uploaded_document"
    _, ext = os.path.splitext(filename.lower())

    if ext not in ALLOWED_EXTENSIONS:
        formats = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ValidationError(f"Unsupported file format '{ext}'. Supported formats: {formats}")

    settings = get_settings()
    content_bytes = await file.read()

    if len(content_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise PayloadTooLargeError(
            f"File size ({len(content_bytes)} bytes) exceeds limit of "
            f"{settings.MAX_UPLOAD_SIZE_BYTES} bytes."
        )

    try:
        content_str = content_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValidationError("File content must be valid UTF-8 text") from exc

    return await ingest_document(filename=filename, content=content_str)


@router.get("/documents", response_model=list[DocumentSummary])
async def list_documents() -> list[DocumentSummary]:
    """List all ingested governance documents and agent configurations."""
    return await get_document_summaries()


@router.get("/graph", response_model=GraphSnapshot)
async def get_graph() -> GraphSnapshot:
    """Retrieve full graph snapshot (all nodes and edges with counts)."""
    return await get_current_graph()


@router.get("/graph/nodes/{node_id:path}", response_model=NodeDetailResponse)
async def get_node_by_id(node_id: str) -> NodeDetailResponse:
    """Retrieve detailed node information and its immediate connected neighbors."""
    detail = await get_node_detail(node_id)
    if not detail:
        raise NotFoundError(f"Node '{node_id}' not found in governance graph")
    return detail


@router.delete("/graph", response_model=ClearGraphResponse)
async def clear_full_graph() -> ClearGraphResponse:
    """Clear all nodes and relationships from the governance graph."""
    return await delete_graph()
