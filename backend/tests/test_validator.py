"""Unit tests for Cypher safety validator verifying strict read-only enforcement."""

import pytest

from app.core.errors import ValidationError
from app.llm.validator import sanitize_cypher_text, validate_cypher_query


def test_sanitize_cypher_text() -> None:
    """Verify markdown fences and comments are cleanly stripped."""
    raw = "```cypher\n// Find all agents\nMATCH (a:Agent) RETURN a;\n```"
    cleaned = sanitize_cypher_text(raw)
    assert cleaned == "MATCH (a:Agent) RETURN a"


def test_valid_read_queries() -> None:
    """Safe read queries must pass validation unchanged."""
    valid_queries = [
        "MATCH (a:Agent)-[r:CAN_CALL]->(t:Tool) RETURN a, r, t",
        "OPTIONAL MATCH (u:User)-[r:OWNS]->(a:Agent) RETURN u, a",
        "WITH 'Finance' AS dept MATCH (a:Agent) WHERE a.dept = dept RETURN a",
        "RETURN 1 AS test_val",
        "MATCH (a:Agent) WHERE NOT (a)-[:GOVERNED_BY]->(:Policy) RETURN a.id, a.name",
    ]
    for q in valid_queries:
        validated = validate_cypher_query(q)
        assert "RETURN" in validated


@pytest.mark.parametrize(
    "unsafe_query,expected_err",
    [
        ("CREATE (n:Agent {name: 'Malicious'}) RETURN n", "CREATE clause"),
        ("MERGE (n:Agent {name: 'Malicious'}) RETURN n", "MERGE clause"),
        ("MATCH (n:Agent) SET n.name = 'Hacked' RETURN n", "SET clause"),
        ("MATCH (n:Agent) DELETE n RETURN count(n)", "DELETE clause"),
        ("MATCH (n:Agent) DETACH DELETE n", "DETACH clause"),
        ("MATCH (n:Agent) REMOVE n.role RETURN n", "REMOVE clause"),
        ("DROP INDEX ON :Agent(id)", "DROP clause"),
        ("ALTER USER neo4j SET PASSWORD '123'", "ALTER clause"),
        ("LOAD CSV FROM 'http://evil.com/data.csv' AS row RETURN row", "LOAD CSV"),
        ("CALL dbms.security.createUser('hacker', 'pass')", "dbms procedures"),
        ("CALL apoc.periodic.iterate('MATCH (n) RETURN n', 'DETACH DELETE n')", "apoc procedures"),
        ("MATCH (a:Agent) RETURN a; MATCH (b:Tool) DETACH DELETE b", "Multiple Cypher statements"),
        ("MATCH (a:Agent) WHERE a.name = 'Test'", "must contain a RETURN clause"),
        ("", "cannot be empty"),
    ],
)
def test_reject_unsafe_mutations(unsafe_query: str, expected_err: str) -> None:
    """Validator must reject any mutation clauses, multiple statements, or missing RETURN."""
    with pytest.raises(ValidationError) as exc_info:
        validate_cypher_query(unsafe_query)
    assert expected_err.lower() in str(exc_info.value).lower()
