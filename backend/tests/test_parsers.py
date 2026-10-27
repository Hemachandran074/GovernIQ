"""Unit tests for YAML, JSON, and Markdown governance document parsers."""

import pytest

from app.core.errors import UnparseableDocumentError
from app.parsers import parse_document
from app.parsers.json_yaml import parse_json_or_yaml
from app.parsers.markdown import parse_markdown


def test_parse_declarative_agent_yaml() -> None:
    yaml_content = """
agent:
  name: "Support Assistant"
  description: "Customer service bot"
  model: "claude-3-haiku"
  owner: "Alice Smith"
  tools:
    - "Search Knowledge Base"
    - "Refund Processor"
  datasources:
    - "Customer DB"
  policies:
    - "GDPR Compliance"
"""
    doc = parse_json_or_yaml(yaml_content, "support_agent.yaml")

    types = {n.type for n in doc.nodes}
    assert "Agent" in types
    assert "Model" in types
    assert "User" in types
    assert "Tool" in types
    assert "DataSource" in types
    assert "Policy" in types

    agent_node = next(n for n in doc.nodes if n.type == "Agent")
    assert agent_node.name == "Support Assistant"

    edge_types = {e.type for e in doc.edges}
    assert "USES" in edge_types
    assert "OWNS" in edge_types
    assert "CAN_CALL" in edge_types
    assert "ACCESSES" in edge_types
    assert "GOVERNED_BY" in edge_types


def test_parse_manifest_json() -> None:
    json_content = """{
  "nodes": [
    {"name": "Analytics DB", "type": "DataSource"},
    {"name": "Reporting Bot", "type": "Agent"}
  ],
  "edges": [
    {"source": "Reporting Bot", "target": "Analytics DB", "type": "ACCESSES_DATA"}
  ]
}"""
    doc = parse_json_or_yaml(json_content, "manifest.json", is_json=True)
    assert len(doc.nodes) == 2
    assert len(doc.edges) == 1
    assert doc.edges[0].type == "ACCESSES_DATA"


def test_parse_markdown_policy_sections() -> None:
    md_content = """# Data Retention and Privacy Policy
This policy governs data handling across all production services.

## Scope and Objectives
All automated agents must adhere to strict encryption at rest.

## Compliance Requirements
Audit trails must be maintained for 365 days minimum.
"""
    doc = parse_markdown(md_content, "privacy_policy.md")
    assert len(doc.nodes) >= 1
    policy_node = doc.nodes[0]
    assert policy_node.type == "Policy"
    assert policy_node.name == "Data Retention and Privacy Policy"
    assert "Scope and Objectives" in policy_node.props["sections"]


def test_unparseable_yaml_raises_error() -> None:
    bad_yaml = "agent: [unclosed list"
    with pytest.raises(UnparseableDocumentError):
        parse_document(bad_yaml, "broken.yaml")


def test_parse_customer_support_agent_manifest() -> None:
    yaml_content = """
agent:
  id: customer-support-agent
  name: Customer Support Agent
  description: Answers customer questions.
  version: "1.0.0"

owner:
  id: user-ai-platform
  name: AI Platform Team
  email: ai-platform@company.com

model:
  id: model-gpt-4-1
  name: gpt-4.1
  provider: openai

tools:
  - id: tool-search-docs
    name: search_docs
    reads_from:
      - ds-knowledge-base
      - ds-product-docs
  - id: tool-crm-lookup
    name: crm_lookup
    reads_from:
      - ds-crm-database
  - id: tool-send-email
    name: send_email
  - id: tool-calculator
    name: calculator

data_sources:
  - id: ds-knowledge-base
    name: knowledge-base
  - id: ds-crm-database
    name: crm-database
  - id: ds-product-docs
    name: product-docs

policies:
  - id: policy-pii
    name: PII Handling Policy
  - id: policy-rate-limit
    name: Rate Limiting Policy
  - id: policy-prompt-logging
    name: Prompt Logging Policy
"""
    doc = parse_json_or_yaml(yaml_content, "customer-support-agent.yaml")

    # 13 nodes: 1 Agent + 1 User + 1 Model + 4 Tools + 3 DataSources + 3 Policies
    assert len(doc.nodes) == 13
    types = {n.type for n in doc.nodes}
    assert types == {"Agent", "User", "Model", "Tool", "DataSource", "Policy"}

    # 12 edges: 1 OWNS + 1 USES + 4 CAN_CALL + 3 READS + 3 GOVERNED_BY
    assert len(doc.edges) == 12
    edge_types = {e.type for e in doc.edges}
    assert edge_types == {"OWNS", "USES", "CAN_CALL", "READS", "GOVERNED_BY"}

    # Verify transitive tool -> datasource paths
    reads_edges = [e for e in doc.edges if e.type == "READS"]
    assert len(reads_edges) == 3
    search_reads = [e.target for e in reads_edges if "search-docs" in e.source or "search_docs" in e.source]
    assert any("knowledge-base" in t for t in search_reads)
    assert any("product-docs" in t for t in search_reads)

