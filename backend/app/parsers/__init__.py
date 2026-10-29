"""Parsers package for MD, YAML, and JSON governance documents."""

import hashlib
import os

from app.core.errors import UnparseableDocumentError
from app.parsers.json_yaml import parse_json_or_yaml
from app.parsers.markdown import parse_markdown
from app.parsers.models import ParsedDocument, ParsedEdge, ParsedNode
from app.parsers.prose_extraction import extract_markdown_prose, heuristic_prose_extractor
from app.parsers.runtime_logs import parse_runtime_logs


def compute_content_hash(content: str) -> str:
    """Return 8-character hex digest of file content for provenance."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:8]


def parse_document(content: str, filename: str) -> ParsedDocument:
    """Parse raw content from supported file types into a ParsedDocument."""
    _, ext = os.path.splitext(filename.lower())
    content_hash = compute_content_hash(content)
    doc_id = filename

    if ext in (".jsonl",):
        parsed = parse_runtime_logs(content, filename=doc_id)
    elif ext in (".json",):
        parsed = parse_json_or_yaml(content, filename=doc_id, is_json=True)
    elif ext in (".yaml", ".yml"):
        parsed = parse_json_or_yaml(content, filename=doc_id, is_json=False)
    elif ext in (".md", ".markdown"):
        # Check if YAML frontmatter with targets exists
        has_frontmatter = bool(content.startswith("---") and "---" in content[3:])
        if has_frontmatter:
            parsed = parse_markdown(content, filename=doc_id)
        else:
            # Fall back to heuristic prose extraction
            h_payload = heuristic_prose_extractor(content, doc_id)
            if h_payload.nodes:
                from app.graph.identifiers import make_node_id

                nodes_map: dict[str, ParsedNode] = {}
                edges_map: dict[str, ParsedEdge] = {}
                for n in h_payload.nodes:
                    nid = make_node_id(n.type, n.name)
                    nodes_map[nid] = ParsedNode(
                        id=nid, name=n.name, type=n.type, source_doc=doc_id, props=n.props
                    )
                for e in h_payload.edges:
                    sid = make_node_id(e.source_type, e.source)
                    tid = make_node_id(e.target_type, e.target)
                    eid = f"{sid}-{e.type}-{tid}"
                    edges_map[eid] = ParsedEdge(
                        id=eid, source=sid, target=tid, type=e.type, props=e.props
                    )
                parsed = ParsedDocument(
                    source_doc=doc_id,
                    nodes=list(nodes_map.values()),
                    edges=list(edges_map.values()),
                )
            else:
                parsed = parse_markdown(content, filename=doc_id)
    else:
        raise UnparseableDocumentError(
            f"Unsupported file extension '{ext}'. Only .md, .yaml, .yml, .json, and .jsonl are supported."
        )

    for n in parsed.nodes:
        n.props["content_hash"] = content_hash
    return parsed


async def parse_document_async(content: str, filename: str) -> ParsedDocument:
    """Parse raw content asynchronously with LLM-assisted prose extraction for Markdown."""
    _, ext = os.path.splitext(filename.lower())
    content_hash = compute_content_hash(content)
    doc_id = filename

    if ext in (".jsonl",):
        parsed = parse_runtime_logs(content, filename=doc_id)
    elif ext in (".json",):
        parsed = parse_json_or_yaml(content, filename=doc_id, is_json=True)
    elif ext in (".yaml", ".yml"):
        parsed = parse_json_or_yaml(content, filename=doc_id, is_json=False)
    elif ext in (".md", ".markdown"):
        has_frontmatter = bool(content.startswith("---") and "---" in content[3:])
        if has_frontmatter:
            parsed = parse_markdown(content, filename=doc_id)
        else:
            parsed = await extract_markdown_prose(content, filename=doc_id)
    else:
        raise UnparseableDocumentError(
            f"Unsupported file extension '{ext}'. Only .md, .yaml, .yml, .json, and .jsonl are supported."
        )

    for n in parsed.nodes:
        n.props["content_hash"] = content_hash
    return parsed


__all__ = [
    "ParsedDocument",
    "ParsedEdge",
    "ParsedNode",
    "compute_content_hash",
    "parse_document",
    "parse_document_async",
]
