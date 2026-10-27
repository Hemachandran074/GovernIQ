"""Cypher query safety validator enforcing strictly read-only execution."""

import re

from app.core.errors import ValidationError

FORBIDDEN_MUTATION_PATTERNS = [
    (r"\bCALL\s+apoc", "apoc procedures are not permitted in read-only queries"),
    (r"\bCALL\s+dbms", "dbms procedures are not permitted in read-only queries"),
    (r"\bALTER\b", "ALTER clause is not permitted in read-only queries"),
    (r"\bDETACH\b", "DETACH clause is not permitted in read-only queries"),
    (r"\bCREATE\b", "CREATE clause is not permitted in read-only queries"),
    (r"\bMERGE\b", "MERGE clause is not permitted in read-only queries"),
    (r"\bSET\b", "SET clause is not permitted in read-only queries"),
    (r"\bDELETE\b", "DELETE clause is not permitted in read-only queries"),
    (r"\bREMOVE\b", "REMOVE clause is not permitted in read-only queries"),
    (r"\bDROP\b", "DROP clause is not permitted in read-only queries"),
    (r"\bLOAD\s+CSV\b", "LOAD CSV is not permitted in read-only queries"),
    (r"\bPERIODIC\s+COMMIT\b", "PERIODIC COMMIT is not permitted"),
]

ALLOWED_START_KEYWORDS = ("MATCH", "OPTIONAL", "WITH", "RETURN")


def sanitize_cypher_text(raw_query: str) -> str:
    """Strip markdown code formatting and trailing semicolons from Cypher string."""
    cleaned = raw_query.strip()

    # Strip markdown code blocks like ```cypher ... ``` or ``` ... ```
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:cypher)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    # Remove inline line comments
    cleaned = re.sub(r"//.*$", "", cleaned, flags=re.MULTILINE)

    # Strip trailing semicolon
    cleaned = cleaned.rstrip(";").strip()

    return cleaned


def validate_cypher_query(query: str) -> str:
    """Validate that a Cypher query is strictly read-only and safe to execute.

    Raises ValidationError if any mutation keyword or unsafe pattern is detected.
    Returns cleaned, safe Cypher query string.
    """
    cleaned = sanitize_cypher_text(query)

    if not cleaned:
        raise ValidationError("Cypher query cannot be empty")

    # Reject multiple statements (semicolon inside query text)
    if ";" in cleaned:
        raise ValidationError("Multiple Cypher statements are not permitted")

    # Check for forbidden mutation keywords (case-insensitive word boundary)
    for pattern, reason in FORBIDDEN_MUTATION_PATTERNS:
        if re.search(pattern, cleaned, re.IGNORECASE):
            raise ValidationError(f"Unsafe Cypher query rejected: {reason}")

    # Check that query starts with an allowed read clause
    first_word_match = re.match(r"^\s*([A-Za-z]+)", cleaned)
    if not first_word_match:
        raise ValidationError("Could not identify starting Cypher clause")

    first_word = first_word_match.group(1).upper()
    if first_word not in ALLOWED_START_KEYWORDS:
        raise ValidationError(
            f"Read-only Cypher query must start with one of {ALLOWED_START_KEYWORDS}, "
            f"got '{first_word}'"
        )

    # Enforce that query contains a RETURN clause
    if not re.search(r"\bRETURN\b", cleaned, re.IGNORECASE):
        raise ValidationError("Read-only Cypher query must contain a RETURN clause")

    return cleaned
