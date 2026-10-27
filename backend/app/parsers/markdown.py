"""Markdown parser for governance policies and controls."""

import re
from typing import Any

import yaml

from app.core.errors import UnparseableDocumentError
from app.graph.identifiers import make_node_id
from app.parsers.models import ParsedDocument, ParsedEdge, ParsedNode


def parse_markdown(content: str, filename: str) -> ParsedDocument:
    """Parse Markdown policy documents extracting Policy nodes and governance edges."""
    nodes_map: dict[str, ParsedNode] = {}
    edges_map: dict[str, ParsedEdge] = {}

    def add_node(name: str, node_type: str, props: dict[str, Any] | None = None) -> ParsedNode:
        node_id = make_node_id(node_type, name)
        if node_id not in nodes_map:
            nodes_map[node_id] = ParsedNode(
                id=node_id,
                name=name.strip(),
                type=node_id.split(":")[0],
                source_doc=filename,
                props=props or {},
            )
        elif props:
            nodes_map[node_id].props.update(props)
        return nodes_map[node_id]

    def add_edge(source_id: str, target_id: str, rel_type: str = "GOVERNED_BY") -> ParsedEdge:
        edge_id = f"{source_id}-{rel_type}-{target_id}"
        if edge_id not in edges_map:
            edges_map[edge_id] = ParsedEdge(
                id=edge_id,
                source=source_id,
                target=target_id,
                type=rel_type,
            )
        return edges_map[edge_id]

    frontmatter_data: dict[str, Any] = {}
    body = content

    # Check for YAML front matter block
    frontmatter_match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if frontmatter_match:
        try:
            frontmatter_data = yaml.safe_load(frontmatter_match.group(1)) or {}
            body = frontmatter_match.group(2)
        except Exception:
            pass

    # Extract Policy Name
    policy_name: str | None = None
    if isinstance(frontmatter_data, dict):
        policy_name = frontmatter_data.get("policy") or frontmatter_data.get("name")

    if not policy_name:
        # Check first level 1 or 2 heading
        heading_match = re.search(r"^#{1,3}\s+(?:Policy:?\s*)?([^\n]+)", body, re.MULTILINE)
        if heading_match:
            policy_name = heading_match.group(1).strip()

    if not policy_name:
        policy_name = filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").title()

    policy_props: dict[str, Any] = {}
    if isinstance(frontmatter_data, dict):
        policy_props = {
            k: v
            for k, v in frontmatter_data.items()
            if k not in ("policy", "name", "applies_to", "targets")
        }

    sections = [h.strip() for h in re.findall(r"^#{1,3}\s+([^\n]+)", body, re.MULTILINE)]
    if sections:
        policy_props["sections"] = sections

    policy_node = add_node(policy_name, "Policy", policy_props)

    # Extract target entities from frontmatter
    targets: list[str] = []
    if isinstance(frontmatter_data, dict):
        raw_targets = frontmatter_data.get("applies_to") or frontmatter_data.get("targets") or []
        if isinstance(raw_targets, list):
            targets.extend(str(t) for t in raw_targets)

    # Extract targets from markdown bullet lists under sections like "Applies To", "Governs", etc.
    section_pattern = (
        r"(?:Applies to|Governs|Target Agents?|Target Tools?|Scope):\s*\n"
        r"((?:\s*[-*]\s*[^\n]+\n?)+)"
    )
    section_matches = re.finditer(section_pattern, body, re.IGNORECASE)
    for section in section_matches:
        list_text = section.group(1)
        items = re.findall(r"[-*]\s*([^\n]+)", list_text)
        targets.extend(item.strip() for item in items)

    # Connect targets to Policy node
    for target in targets:
        clean_target = re.sub(
            r"^(?:Agent|Tool|DataSource|Model):\s*", "", target, flags=re.IGNORECASE
        ).strip()
        # Detect explicit target type if prefixed
        target_type = "Agent"
        if target.lower().startswith("tool:"):
            target_type = "Tool"
        elif target.lower().startswith("datasource:") or target.lower().startswith("data source:"):
            target_type = "DataSource"
        elif target.lower().startswith("model:"):
            target_type = "Model"

        target_node = add_node(clean_target, target_type)
        add_edge(target_node.id, policy_node.id, "GOVERNED_BY")

    if not nodes_map:
        raise UnparseableDocumentError(
            "Failed to extract policy definitions from Markdown document"
        )

    return ParsedDocument(
        source_doc=filename, nodes=list(nodes_map.values()), edges=list(edges_map.values())
    )
