"""Unit tests for Markdown prose extraction and strict schema validation."""

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.core.config import get_settings
from app.main import app
from app.parsers.prose_extraction import (
    ExtractedDocumentPayload,
    ExtractedEdge,
    ExtractedNode,
    extract_markdown_prose,
    heuristic_prose_extractor,
)


def test_schema_validation_accepts_valid_payload() -> None:
    """Strict Pydantic model must accept canonical node and relationship types."""
    valid_data = {
        "nodes": [
            {"name": "Support Bot", "type": "Agent", "props": {}},
            {"name": "Claude 3.5 Sonnet", "type": "Model", "props": {}},
            {"name": "Postgres Database", "type": "DataSource", "props": {}},
        ],
        "edges": [
            {
                "source": "Support Bot",
                "source_type": "Agent",
                "target": "Claude 3.5 Sonnet",
                "target_type": "Model",
                "type": "USES",
                "props": {},
            }
        ],
    }
    payload = ExtractedDocumentPayload.model_validate(valid_data)
    assert len(payload.nodes) == 3
    assert len(payload.edges) == 1
    assert payload.nodes[0].name == "Support Bot"


def test_schema_validation_rejects_disallowed_node_type() -> None:
    """Pydantic model must reject unknown node types before graph write (Invariant 4)."""
    invalid_data = {
        "nodes": [
            {"name": "Linux Server", "type": "VirtualMachine"}  # Disallowed
        ],
        "edges": [],
    }
    with pytest.raises(ValidationError):
        ExtractedDocumentPayload.model_validate(invalid_data)


def test_schema_validation_rejects_disallowed_edge_type() -> None:
    """Pydantic model must reject unknown edge types before graph write (Invariant 4)."""
    invalid_data = {
        "nodes": [
            {"name": "Support Bot", "type": "Agent"},
            {"name": "SQL Tool", "type": "Tool"},
        ],
        "edges": [
            {
                "source": "Support Bot",
                "source_type": "Agent",
                "target": "SQL Tool",
                "target_type": "Tool",
                "type": "MUTATES",  # Disallowed relationship
            }
        ],
    }
    with pytest.raises(ValidationError):
        ExtractedDocumentPayload.model_validate(invalid_data)


def test_heuristic_prose_extraction() -> None:
    """Heuristic extractor accurately extracts entities and relationships from free-form prose."""
    prose_content = """# Customer Service Security Standard

The Customer Support Agent is owned by Sarah Connor in Operations.
The agent uses the Claude 3.5 Sonnet model for reasoning and query generation.
It is authorized to call the Zendesk API Tool and SQL Query Tool.
These tools read from the Customer Database to resolve tickets.
All systems must adhere to this security standard.
"""
    payload = heuristic_prose_extractor(prose_content, "customer_service_standard.md")

    node_types = {n.type for n in payload.nodes}
    node_names = {n.name for n in payload.nodes}

    assert "Policy" in node_types
    assert "Agent" in node_types
    assert "Model" in node_types
    assert "Tool" in node_types
    assert "DataSource" in node_types
    assert "User" in node_types

    assert "Customer Support Agent" in node_names
    assert "Claude 3.5 Sonnet" in node_names
    assert "Customer Database" in node_names
    assert "Sarah Connor" in node_names

    edge_types = {e.type for e in payload.edges}
    assert "OWNS" in edge_types
    assert "USES" in edge_types
    assert "CAN_CALL" in edge_types
    assert "READS" in edge_types
    assert "GOVERNED_BY" in edge_types


@pytest.mark.asyncio
async def test_extract_markdown_prose_produces_valid_parsed_document() -> None:
    """extract_markdown_prose produces a canonical ParsedDocument with deterministic slug IDs."""
    prose_content = """# Financial Data Governance Policy

The Financial Analyst Assistant operates under supervision.
It uses GPT-4o to analyze financial records.
The assistant connects via the Stripe Payment Tool which writes to the Financial Ledger Database.
"""
    parsed = await extract_markdown_prose(prose_content, "finance_policy.md")

    assert len(parsed.nodes) >= 4
    assert len(parsed.edges) >= 3

    node_ids = [n.id for n in parsed.nodes]
    assert any(nid.startswith("Policy:") for nid in node_ids)
    assert any(nid.startswith("Agent:") for nid in node_ids)
    assert any(nid.startswith("Model:") for nid in node_ids)
    assert any(nid.startswith("Tool:") for nid in node_ids)


@pytest.mark.asyncio
async def test_upload_freeform_markdown_document_integration() -> None:
    """Uploading a free-form Markdown document extracts graph and returns snapshot."""
    settings = get_settings()
    headers = {"X-API-Key": settings.API_KEY}

    markdown_file = (
        b"# Data Retention Guideline\n\n"
        b"The Audit Bot is operated by Alice Smith. "
        b"It uses Llama 3.3 to summarize records from the S3 Data Lake. "
        b"All tools must comply with the retention policy.\n"
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/documents",
            headers=headers,
            files={"file": ("retention_policy.md", markdown_file, "text/markdown")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"]["nodes_processed"] >= 3
        assert data["graph"]["node_count"] >= 3

        node_types = {n["type"] for n in data["graph"]["nodes"]}
        assert "Policy" in node_types
        assert "Agent" in node_types
