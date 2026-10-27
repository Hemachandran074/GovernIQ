"""Deterministic identifier generator for graph nodes."""

import re

# Canonical node types defined in architecture.md
CANONICAL_TYPE_MAP: dict[str, str] = {
    "user": "User",
    "agent": "Agent",
    "model": "Model",
    "tool": "Tool",
    "datasource": "DataSource",
    "data_source": "DataSource",
    "data-source": "DataSource",
    "policy": "Policy",
}


def normalize_node_type(raw_type: str) -> str:
    """Normalize raw node type to its canonical PascalCase representation.

    Examples:
        'user' -> 'User'
        'data_source' -> 'DataSource'
        'Policy' -> 'Policy'
    """
    cleaned = raw_type.strip().lower()
    if cleaned in CANONICAL_TYPE_MAP:
        return CANONICAL_TYPE_MAP[cleaned]

    # Fallback to TitleCase for unrecognized labels
    return "".join(part.capitalize() for part in re.split(r"[-_\s]+", cleaned) if part)


def slugify_name(name: str) -> str:
    """Convert an entity name to a lowercased, hyphenated URL/ID safe slug."""
    # Convert to lower
    slug = name.strip().lower()
    # Replace non-alphanumeric characters with hyphens
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    # Strip leading and trailing hyphens
    slug = slug.strip("-")
    if not slug:
        raise ValueError(f"Entity name '{name}' produces an empty slug")
    return slug


def make_node_id(node_type: str, name: str) -> str:
    """Create a deterministic stable slug ID for any graph entity.

    Format: <CanonicalType>:<slugified-name>

    Examples:
        make_node_id('User', 'Alice Cooper') -> 'User:alice-cooper'
        make_node_id('DataSource', 'Customer DB (Prod)') -> 'DataSource:customer-db-prod'
        make_node_id('agent', 'Support Triage Agent') -> 'Agent:support-triage-agent'

    Raises:
        ValueError: If node_type or name is empty or produces an empty slug.
    """
    if not node_type or not node_type.strip():
        raise ValueError("node_type cannot be empty")
    if not name or not name.strip():
        raise ValueError("name cannot be empty")

    canonical_type = normalize_node_type(node_type)
    slug = slugify_name(name)
    return f"{canonical_type}:{slug}"
