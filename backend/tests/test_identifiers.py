"""Tests for graph entity identifier generation and normalization."""

import pytest

from app.graph.identifiers import make_node_id, normalize_node_type, slugify_name


def test_normalize_node_type() -> None:
    """Canonical node types must normalize correctly to PascalCase."""
    assert normalize_node_type("user") == "User"
    assert normalize_node_type("User") == "User"
    assert normalize_node_type("agent") == "Agent"
    assert normalize_node_type("AGENT") == "Agent"
    assert normalize_node_type("model") == "Model"
    assert normalize_node_type("tool") == "Tool"
    assert normalize_node_type("datasource") == "DataSource"
    assert normalize_node_type("data_source") == "DataSource"
    assert normalize_node_type("data-source") == "DataSource"
    assert normalize_node_type("policy") == "Policy"


def test_slugify_name() -> None:
    """Names must be transformed into clean, hyphenated lowercase slugs."""
    assert slugify_name("Alice Cooper") == "alice-cooper"
    assert slugify_name("  Support Triage Agent  ") == "support-triage-agent"
    assert slugify_name("PostgreSQL (Production-DB) #1") == "postgresql-production-db-1"
    assert slugify_name("claude-3-5-sonnet") == "claude-3-5-sonnet"


def test_slugify_invalid_name_raises_value_error() -> None:
    """Names consisting purely of symbols or whitespace must raise ValueError."""
    with pytest.raises(ValueError, match="produces an empty slug"):
        slugify_name("!@#$%^&*()")
    with pytest.raises(ValueError, match="produces an empty slug"):
        slugify_name("   ")


def test_make_node_id_all_canonical_types() -> None:
    """make_node_id must generate stable slug IDs for all six node labels."""
    assert make_node_id("User", "John Doe") == "User:john-doe"
    assert make_node_id("Agent", "Compliance Auditor") == "Agent:compliance-auditor"
    assert make_node_id("Model", "Llama 3.3 70B") == "Model:llama-3-3-70b"
    assert make_node_id("Tool", "SQL Query Executor") == "Tool:sql-query-executor"
    assert (
        make_node_id("DataSource", "Customer Records Bucket")
        == "DataSource:customer-records-bucket"
    )
    assert make_node_id("data_source", "Customer DB") == "DataSource:customer-db"
    assert make_node_id("Policy", "PII Redaction Control") == "Policy:pii-redaction-control"


def test_make_node_id_validation_errors() -> None:
    """Invalid or empty inputs to make_node_id must raise ValueError."""
    with pytest.raises(ValueError, match="node_type cannot be empty"):
        make_node_id("", "Some Name")

    with pytest.raises(ValueError, match="name cannot be empty"):
        make_node_id("Agent", "")

    with pytest.raises(ValueError, match="produces an empty slug"):
        make_node_id("Tool", "---")
