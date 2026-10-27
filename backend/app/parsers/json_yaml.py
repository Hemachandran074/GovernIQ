"""Deterministic JSON and YAML parser for agent configs and governance declarations."""

import json
from typing import Any

import yaml

from app.core.errors import UnparseableDocumentError
from app.graph.identifiers import make_node_id
from app.parsers.models import ParsedDocument, ParsedEdge, ParsedNode


def _parse_raw_text(content: str, is_json: bool) -> Any:
    """Parse raw string content into Python data structures."""
    try:
        if is_json:
            return json.loads(content)
        return yaml.safe_load(content)
    except Exception as exc:
        format_name = "JSON" if is_json else "YAML"
        raise UnparseableDocumentError(f"Failed to parse {format_name}: {exc}") from exc


def parse_json_or_yaml(content: str, filename: str, is_json: bool = False) -> ParsedDocument:
    """Parse JSON or YAML document into normalized graph nodes and edges."""
    data = _parse_raw_text(content, is_json)
    if not isinstance(data, (dict, list)):
        raise UnparseableDocumentError("Document root must be a dictionary or list")

    nodes_map: dict[str, ParsedNode] = {}
    edges_map: dict[str, ParsedEdge] = {}
    raw_id_map: dict[str, str] = {}

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

    def add_edge(
        source_id: str, target_id: str, rel_type: str, props: dict[str, Any] | None = None
    ) -> ParsedEdge:
        edge_id = f"{source_id}-{rel_type}-{target_id}"
        if edge_id not in edges_map:
            edges_map[edge_id] = ParsedEdge(
                id=edge_id,
                source=source_id,
                target=target_id,
                type=rel_type,
                props=props or {},
            )
        return edges_map[edge_id]

    def clean_props(d: dict[str, Any], exclude: tuple[str, ...]) -> dict[str, Any]:
        return {
            k: v
            for k, v in d.items()
            if k not in exclude and v is not None and not isinstance(v, (dict, list))
        }

    # 1. Handle explicit { nodes: [...], edges: [...] } structure
    if isinstance(data, dict) and "nodes" in data and isinstance(data["nodes"], list):
        for raw_node in data["nodes"]:
            if isinstance(raw_node, dict) and "name" in raw_node and "type" in raw_node:
                node_props = {k: v for k, v in raw_node.items() if k not in ("name", "type", "id")}
                created = add_node(str(raw_node["name"]), str(raw_node["type"]), node_props)
                if "id" in raw_node:
                    raw_id_map[str(raw_node["id"])] = created.id
                raw_id_map[str(raw_node["name"])] = created.id

        if "edges" in data and isinstance(data["edges"], list):
            for raw_edge in data["edges"]:
                if isinstance(raw_edge, dict) and "source" in raw_edge and "target" in raw_edge:
                    s_id = raw_id_map.get(str(raw_edge["source"]), str(raw_edge["source"]))
                    t_id = raw_id_map.get(str(raw_edge["target"]), str(raw_edge["target"]))
                    r_type = str(raw_edge.get("type", "GOVERNED_BY"))
                    edge_props = {
                        k: v
                        for k, v in raw_edge.items()
                        if k not in ("source", "target", "type", "id")
                    }
                    add_edge(s_id, t_id, r_type, edge_props)

        return ParsedDocument(
            source_doc=filename, nodes=list(nodes_map.values()), edges=list(edges_map.values())
        )

    # 2. Handle declarative agent configs (root or nested agent/agents)
    agents_list: list[dict[str, Any]] = []
    if isinstance(data, dict):
        if "agent" in data and isinstance(data["agent"], dict):
            agents_list.append(data["agent"])
        elif "agents" in data and isinstance(data["agents"], list):
            agents_list.extend(item for item in data["agents"] if isinstance(item, dict))
        elif "name" in data or "id" in data:
            agents_list.append(data)
    elif isinstance(data, list):
        agents_list.extend(
            item for item in data if isinstance(item, dict) and ("name" in item or "id" in item)
        )

    # If no explicit agent container found, synthesize a default agent if other entities exist
    if not agents_list and isinstance(data, dict):
        has_entities = any(
            k in data
            for k in ("owner", "model", "tools", "data_sources", "datasources", "policies")
        )
        if has_entities:
            agents_list.append({"name": filename.rsplit(".", 1)[0].replace("-", " ").title()})

    agent_nodes: list[ParsedNode] = []
    for item in agents_list:
        agent_name = str(item.get("name") or item.get("id") or "Unnamed Agent")
        agent_props = {
            "version": str(item.get("version", "1.0.0")),
            "description": str(item.get("description", "")),
        }
        for extra_key in ("environment", "status"):
            if extra_key in item:
                agent_props[extra_key] = str(item[extra_key])

        a_node = add_node(agent_name, "Agent", agent_props)
        if "id" in item:
            raw_id_map[str(item["id"])] = a_node.id
        raw_id_map[agent_name] = a_node.id
        agent_nodes.append(a_node)

    # Pre-register DataSources (both root and inside agents) so tool reads_from resolves
    all_raw_datasources: list[Any] = []
    if isinstance(data, dict):
        root_ds = data.get("data_sources") or data.get("datasources")
        if isinstance(root_ds, list):
            all_raw_datasources.extend(root_ds)
        elif isinstance(root_ds, (str, dict)):
            all_raw_datasources.append(root_ds)

    for item in agents_list:
        item_ds = item.get("data_sources") or item.get("datasources")
        if isinstance(item_ds, list):
            all_raw_datasources.extend(item_ds)
        elif isinstance(item_ds, (str, dict)):
            all_raw_datasources.append(item_ds)

    for ds in all_raw_datasources:
        if isinstance(ds, str):
            ds_node = add_node(ds, "DataSource")
            raw_id_map[ds] = ds_node.id
            raw_id_map[ds_node.name] = ds_node.id
        elif isinstance(ds, dict):
            ds_name = str(ds.get("name") or ds.get("id") or "DataSource")
            ds_props = clean_props(ds, ("name", "type", "id"))
            ds_node = add_node(ds_name, "DataSource", ds_props)
            if "id" in ds:
                raw_id_map[str(ds["id"])] = ds_node.id
            raw_id_map[ds_name] = ds_node.id

    for agent_node, item in zip(agent_nodes, agents_list, strict=False):
        # Owner -> User
        raw_owners: list[Any] = []
        owner_val = item.get("owner") or (data.get("owner") if isinstance(data, dict) else None)
        if isinstance(owner_val, list):
            raw_owners.extend(owner_val)
        elif owner_val is not None:
            raw_owners.append(owner_val)

        for owner in raw_owners:
            if isinstance(owner, str):
                user_node = add_node(owner, "User")
                raw_id_map[owner] = user_node.id
                add_edge(user_node.id, agent_node.id, "OWNS")
            elif isinstance(owner, dict):
                u_name = str(owner.get("name") or owner.get("id") or "Owner")
                u_props = clean_props(owner, ("name", "type", "id"))
                user_node = add_node(u_name, "User", u_props)
                if "id" in owner:
                    raw_id_map[str(owner["id"])] = user_node.id
                raw_id_map[u_name] = user_node.id
                add_edge(user_node.id, agent_node.id, "OWNS")

        # Model -> Model
        raw_models: list[Any] = []
        model_val = (
            item.get("model")
            or item.get("models")
            or (data.get("model") or data.get("models") if isinstance(data, dict) else None)
        )
        if isinstance(model_val, list):
            raw_models.extend(model_val)
        elif model_val is not None:
            raw_models.append(model_val)

        for model in raw_models:
            if isinstance(model, str):
                model_node = add_node(model, "Model")
                raw_id_map[model] = model_node.id
                add_edge(agent_node.id, model_node.id, "USES")
            elif isinstance(model, dict):
                m_name = str(model.get("name") or model.get("id") or "Model")
                m_props = clean_props(model, ("name", "type", "id"))
                model_node = add_node(m_name, "Model", m_props)
                if "id" in model:
                    raw_id_map[str(model["id"])] = model_node.id
                raw_id_map[m_name] = model_node.id
                add_edge(agent_node.id, model_node.id, "USES")

        # Policies -> Policy
        raw_policies: list[Any] = []
        policies_val = item.get("policies") or (
            data.get("policies") if isinstance(data, dict) else None
        )
        if isinstance(policies_val, list):
            raw_policies.extend(policies_val)
        elif policies_val is not None:
            raw_policies.append(policies_val)

        for policy in raw_policies:
            if isinstance(policy, str):
                policy_node = add_node(policy, "Policy")
                raw_id_map[policy] = policy_node.id
                add_edge(agent_node.id, policy_node.id, "GOVERNED_BY")
            elif isinstance(policy, dict):
                p_name = str(policy.get("name") or policy.get("id") or "Policy")
                p_props = clean_props(policy, ("name", "type", "id"))
                policy_node = add_node(p_name, "Policy", p_props)
                if "id" in policy:
                    raw_id_map[str(policy["id"])] = policy_node.id
                raw_id_map[p_name] = policy_node.id
                add_edge(agent_node.id, policy_node.id, "GOVERNED_BY")

        # Direct DataSources on Agent
        item_ds_list: list[Any] = []
        direct_ds = item.get("data_sources") or item.get("datasources")
        if isinstance(direct_ds, list):
            item_ds_list.extend(direct_ds)
        elif direct_ds is not None:
            item_ds_list.append(direct_ds)

        for ds in item_ds_list:
            ds_key = str(ds.get("id") or ds.get("name")) if isinstance(ds, dict) else str(ds)
            canonical_ds_id = raw_id_map.get(ds_key)
            if canonical_ds_id:
                add_edge(agent_node.id, canonical_ds_id, "ACCESSES")

        # Tools -> Tool & Transitive DataSources
        raw_tools: list[Any] = []
        tools_val = item.get("tools") or (data.get("tools") if isinstance(data, dict) else None)
        if isinstance(tools_val, list):
            raw_tools.extend(tools_val)
        elif tools_val is not None:
            raw_tools.append(tools_val)

        for t in raw_tools:
            if isinstance(t, str):
                tool_node = add_node(t, "Tool")
                raw_id_map[t] = tool_node.id
                add_edge(agent_node.id, tool_node.id, "CAN_CALL")
            elif isinstance(t, dict):
                t_name = str(t.get("name") or t.get("id") or "Tool")
                t_props = clean_props(
                    t,
                    (
                        "name",
                        "type",
                        "id",
                        "reads",
                        "writes",
                        "reads_from",
                        "writes_to",
                        "sources",
                        "sinks",
                    ),
                )
                tool_node = add_node(t_name, "Tool", t_props)
                if "id" in t:
                    raw_id_map[str(t["id"])] = tool_node.id
                raw_id_map[t_name] = tool_node.id
                add_edge(agent_node.id, tool_node.id, "CAN_CALL")

                # Transitive READS: reads_from, reads, sources
                reads_refs: list[Any] = []
                for r_field in ("reads_from", "reads", "sources"):
                    r_val = t.get(r_field)
                    if isinstance(r_val, list):
                        reads_refs.extend(r_val)
                    elif r_val is not None:
                        reads_refs.append(r_val)

                for r in reads_refs:
                    r_key = str(r.get("id") or r.get("name")) if isinstance(r, dict) else str(r)
                    canonical_id = raw_id_map.get(r_key)
                    if not canonical_id:
                        new_ds = add_node(r_key, "DataSource")
                        canonical_id = new_ds.id
                        raw_id_map[r_key] = canonical_id
                    add_edge(tool_node.id, canonical_id, "READS")

                # Transitive WRITES: writes_to, writes, sinks
                writes_refs: list[Any] = []
                for w_field in ("writes_to", "writes", "sinks"):
                    w_val = t.get(w_field)
                    if isinstance(w_val, list):
                        writes_refs.extend(w_val)
                    elif w_val is not None:
                        writes_refs.append(w_val)

                for w in writes_refs:
                    w_key = str(w.get("id") or w.get("name")) if isinstance(w, dict) else str(w)
                    canonical_id = raw_id_map.get(w_key)
                    if not canonical_id:
                        new_ds = add_node(w_key, "DataSource")
                        canonical_id = new_ds.id
                        raw_id_map[w_key] = canonical_id
                    add_edge(tool_node.id, canonical_id, "WRITES")

    if not nodes_map:
        raise UnparseableDocumentError(
            "No recognizable AI governance entities (Agent, User, Model, Tool) found"
        )

    return ParsedDocument(
        source_doc=filename, nodes=list(nodes_map.values()), edges=list(edges_map.values())
    )
