"""Query and LLM model API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.auth import verify_api_key
from app.services.query import (
    ModelOption,
    QueryResult,
    execute_governance_query,
    get_available_models,
)

router = APIRouter(tags=["Query & Governance"], dependencies=[Depends(verify_api_key)])


class QueryRequest(BaseModel):
    """Natural language governance query request."""

    question: str = Field(
        ..., min_length=1, max_length=1000, description="Natural language question"
    )
    model: str | None = Field(default=None, description="Target LLM model ID")
    effort: str = Field(default="high", description="Reasoning effort: low, medium, or high")


@router.get("/models", response_model=list[ModelOption])
async def list_models() -> list[ModelOption]:
    """Retrieve available LLM models for query processing."""
    return get_available_models()


@router.post("/query", response_model=QueryResult)
async def query_governance_graph(
    payload: QueryRequest,
) -> QueryResult:
    """Execute natural language query, return Cypher, explanation, and graph highlight IDs."""
    return await execute_governance_query(
        question=payload.question,
        model=payload.model,
        effort=payload.effort,
    )
