"""OpenAI-compatible LLM client for NL-to-Cypher translation with heuristic fallback."""

import asyncio
import json
import logging
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.llm.validator import validate_cypher_query

logger = logging.getLogger(__name__)

GRAPH_SCHEMA_PROMPT = """You are an expert Neo4j Cypher generator for an AI Agent Governance Graph.

The graph has the following node labels and relationships:
Node Labels:
- User (properties: id, name, type, source_doc, props)
- Agent (properties: id, name, description, version, type, source_doc, props)
- Model (properties: id, name, type, source_doc, props)
- Tool (properties: id, name, type, source_doc, props)
- DataSource (properties: id, name, type, source_doc, props)
- Policy (properties: id, name, sections, type, source_doc, props)

Relationships:
- (:User)-[:OWNS]->(:Agent)
- (:User)-[:ACCESSES]->(:DataSource)
- (:Agent)-[:USES|USES_MODEL]->(:Model)
- (:Agent)-[:CAN_CALL|HAS_TOOL]->(:Tool)
- (:Tool)-[:READS|READS_FROM]->(:DataSource)
- (:Tool)-[:WRITES]->(:DataSource)
- (:Agent)-[:GOVERNED_BY]->(:Policy)
- (:Tool)-[:GOVERNED_BY]->(:Policy)
- (:DataSource)-[:GOVERNED_BY]->(:Policy)
- (:Model)-[:GOVERNED_BY]->(:Policy)

Instructions:
1. Generate ONLY valid, strictly read-only Cypher queries.
2. NEVER use write operations (CREATE, MERGE, SET, DELETE, DETACH, REMOVE, DROP, ALTER).
3. CRITICAL VISUALIZATION RULE: Always return graph nodes and relationships in the RETURN clause (e.g. `RETURN a, r, t` or `RETURN n, r, m`). NEVER return raw scalar counts, projections, or aggregations (such as `count(*)`, `collect(distinct labels(n))`) without returning the actual node and relationship entities, because the frontend visualizer requires the node and relationship objects to highlight them on the graph canvas.
4. For overview, summary, or "explain this graph" questions, return the entire graph topology:
   `MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100`
5. Always use case-insensitive matching for names: `toLower(n.name) CONTAINS toLower('...')`.
6. Output your answer strictly in valid JSON format with two keys:
   {
     "cypher": "MATCH ... RETURN ...",
     "explanation": "Clear, detailed natural language explanation answering the question and explaining the governance topology."
   }

Few-shot examples:
- User: "Explain this graph"
  Output: {"cypher": "MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100", "explanation": "Retrieves the complete governance topology showing all agents, foundation models, tools, data sources, users, and policies with their connections."}

- User: "Which tools can the Customer Support Agent call?"
  Output: {"cypher": "MATCH (a:Agent)-[r:CAN_CALL|HAS_TOOL]->(t:Tool) WHERE toLower(a.name) CONTAINS toLower('customer support') RETURN a, r, t", "explanation": "Identifies all tools that Customer Support Agent is authorized to invoke."}

- User: "Which agents use model gpt-4.1?"
  Output: {"cypher": "MATCH (a:Agent)-[r:USES|USES_MODEL]->(m:Model) WHERE toLower(m.name) CONTAINS toLower('gpt-4.1') RETURN a, r, m", "explanation": "Finds all agents configured to use the gpt-4.1 model."}

- User: "Which agents can access the crm-database?"
  Output: {"cypher": "MATCH (a:Agent)-[r1:CAN_CALL|HAS_TOOL]->(t:Tool)-[r2:READS|READS_FROM|WRITES]->(ds:DataSource) WHERE toLower(ds.name) CONTAINS toLower('crm-database') RETURN a, r1, t, r2, ds", "explanation": "Traces transitive data source access from agents through their authorized tools to the CRM database."}

- User: "Is there any agent with no policy attached?"
  Output: {"cypher": "MATCH (a:Agent) WHERE NOT (a)-[:GOVERNED_BY]->(:Policy) RETURN a", "explanation": "Detects unmanaged or orphan agents that lack an attached governance policy."}

- User: "What is the blast radius if calculator tool is compromised?"
  Output: {"cypher": "MATCH (t:Tool)<-[r1:CAN_CALL|HAS_TOOL]-(a:Agent)<-[r2:OWNS|USES]-(u:User) WHERE toLower(t.name) CONTAINS toLower('calculator') OPTIONAL MATCH (t)-[r3:READS|READS_FROM|WRITES]->(ds:DataSource) RETURN t, r1, a, r2, u, r3, ds", "explanation": "Calculates the blast radius of the calculator tool by identifying all calling agents, owning users, and accessible data sources."}
"""


def heuristic_nl_to_cypher(question: str) -> tuple[str, str]:
    """Deterministic fallback NL-to-Cypher generator for standard governance queries."""
    q_lower = question.lower().strip()

    # Query 0: Explain this graph / Overview
    is_overview = any(
        kw in q_lower
        for kw in (
            "explain",
            "overview",
            "summary",
            "summarize",
            "architecture",
            "what is in",
            "show all",
            "whole graph",
            "entire graph",
            "all nodes",
            "describe",
        )
    )
    if is_overview:
        return (
            "MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100",
            "Analyzing the complete governance graph topology across agents, models, tools, data sources, users, and policies.",
        )

    # Query 1: What tools does Agent X have access to?
    if "tool" in q_lower and ("agent" in q_lower or "have" in q_lower or "access" in q_lower):
        quote_match = re.search(r"['\"]([A-Za-z0-9_\- ]+)['\"]", question)
        agent_name = ""
        if quote_match:
            agent_name = quote_match.group(1).strip()
        else:
            pre_match = re.search(
                r"(?:can|does|is|for)\s+([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)*)\s+agent",
                question,
                re.IGNORECASE,
            )
            if pre_match:
                agent_name = pre_match.group(1).strip()
            else:
                post_match = re.search(
                    r"agent\s+([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)*)",
                    question,
                    re.IGNORECASE,
                )
                if post_match:
                    tokens = [
                        w
                        for w in post_match.group(1).strip().split()
                        if w.lower() not in ("access", "have", "call", "use", "to", "can", "is")
                    ]
                    if tokens:
                        agent_name = " ".join(tokens)

        if agent_name:
            cypher = (
                f"MATCH (a:Agent)-[r:CAN_CALL]->(t:Tool) "
                f"WHERE toLower(a.name) CONTAINS toLower('{agent_name}') "
                f"RETURN a, r, t"
            )
            explanation = f"Finding all tools that agent '{agent_name}' is authorized to call."
            return cypher, explanation
        return (
            "MATCH (a:Agent)-[r:CAN_CALL]->(t:Tool) RETURN a, r, t",
            "Retrieving all agents and the tools they are authorized to call.",
        )

    # Query 2: Which agents are using Model Y?
    if "model" in q_lower and ("agent" in q_lower or "use" in q_lower or "using" in q_lower):
        model_match = re.search(
            r"model\s+['\"]?([A-Za-z0-9_\-\. ]+)['\"]?", question, re.IGNORECASE
        )
        if model_match:
            model_name = model_match.group(1).strip()
            cypher = (
                f"MATCH (a:Agent)-[r:USES]->(m:Model) "
                f"WHERE toLower(m.name) CONTAINS toLower('{model_name}') "
                f"RETURN a, r, m"
            )
            explanation = f"Identifying all agents utilizing model '{model_name}'."
            return cypher, explanation
        return (
            "MATCH (a:Agent)-[r:USES]->(m:Model) RETURN a, r, m",
            "Listing all agents and the foundation models they utilize.",
        )

    # Query 3: Which agents can access DataSource Z?
    if "data" in q_lower or "datasource" in q_lower or "source" in q_lower or "database" in q_lower:
        ds_match = re.search(
            r"(?:datasource|data source|database|source)\s+['\"]?([A-Za-z0-9_\- ]+)['\"]?",
            question,
            re.IGNORECASE,
        )
        if ds_match:
            ds_name = ds_match.group(1).strip()
            cypher = (
                f"MATCH (a:Agent)-[:CAN_CALL]->(t:Tool)-[r:READS|WRITES]->(ds:DataSource) "
                f"WHERE toLower(ds.name) CONTAINS toLower('{ds_name}') "
                f"RETURN a, t, r, ds"
            )
            explanation = f"Tracing agents that access data source '{ds_name}' through their tools."
            return cypher, explanation
        return (
            "MATCH (a:Agent)-[:CAN_CALL]->(t:Tool)-[r:READS|WRITES]->(ds:DataSource) "
            "RETURN a, t, r, ds",
            "Tracing agents that access data sources through their tools.",
        )

    # Query 4: Is there any agent with no policy attached? (Orphan agents)
    is_orphan_q = (
        ("no policy" in q_lower)
        or ("orphan" in q_lower)
        or ("unattached" in q_lower)
        or ("without policy" in q_lower)
    )
    if is_orphan_q:
        return (
            "MATCH (a:Agent) WHERE NOT (a)-[:GOVERNED_BY]->(:Policy) RETURN a",
            "Detecting orphan agents that have no compliance or governance policy attached.",
        )

    # Query 5: Blast radius of a compromised tool
    if "blast radius" in q_lower or "compromised" in q_lower or "affected" in q_lower:
        tool_match = re.search(r"tool\s+['\"]?([A-Za-z0-9_\- ]+)['\"]?", question, re.IGNORECASE)
        if tool_match:
            tool_name = tool_match.group(1).strip()
            cypher = (
                f"MATCH (t:Tool)<-[:CAN_CALL]-(a:Agent)<-[:OWNS]-(u:User) "
                f"WHERE toLower(t.name) CONTAINS toLower('{tool_name}') "
                f"RETURN t, a, u"
            )
            explanation = (
                f"Calculating blast radius for tool '{tool_name}': "
                f"identifying all agents with calling permissions and their owning users."
            )
            return cypher, explanation
        return (
            "MATCH (t:Tool)<-[:CAN_CALL]-(a:Agent)<-[:OWNS]-(u:User) RETURN t, a, u",
            "Analyzing blast radius: identifying calling agents and owners across tools.",
        )

    # Generic governance query fallback
    return (
        "MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 50",
        "Exploring governance entities and their active relationships across the graph.",
    )


async def generate_cypher_and_explanation(
    question: str,
    model: str | None = None,
    effort: str = "high",
) -> tuple[str, str]:
    """Translate natural language query to Cypher via LLM API or heuristic fallback."""
    settings = get_settings()
    target_model = model or settings.LLM_MODEL
    api_key = settings.LLM_API_KEY.strip()

    # Route provider dynamically
    base_url = settings.LLM_BASE_URL.rstrip("/")
    if target_model.startswith("gpt-") and settings.OPENAI_API_KEY.strip():
        api_key = settings.OPENAI_API_KEY.strip()
        base_url = "https://api.openai.com/v1"

    # If no LLM key configured or offline demo mode, use heuristic fallback
    if not api_key:
        logger.info("No LLM API key configured; using deterministic heuristic translator.")
        cypher, explanation = heuristic_nl_to_cypher(question)
        return validate_cypher_query(cypher), explanation

    endpoint = f"{base_url}/chat/completions"

    temperature = 0.0
    if effort == "low":
        temperature = 0.3
    elif effort == "medium":
        temperature = 0.1

    payload: dict[str, Any] = {
        "model": target_model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": GRAPH_SCHEMA_PROMPT},
            {"role": "user", "content": question},
        ],
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        timeout_cfg = httpx.Timeout(10.0, connect=3.0)
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            response = await asyncio.wait_for(
                client.post(endpoint, json=payload, headers=headers),
                timeout=5.0,
            )

        if response.status_code == 200:
            data = response.json()
            raw_content = data["choices"][0]["message"]["content"]
            # Clean possible markdown block wrappers around JSON
            cleaned_json = re.sub(r"^```(?:json)?\s*", "", raw_content.strip(), flags=re.IGNORECASE)
            cleaned_json = re.sub(r"\s*```$", "", cleaned_json).strip()
            parsed_json = json.loads(cleaned_json)

            cypher = str(parsed_json.get("cypher", "")).strip()
            explanation = str(
                parsed_json.get("explanation", "Query generated successfully.")
            ).strip()

            validated_cypher = validate_cypher_query(cypher)
            return validated_cypher, explanation

        logger.warning(
            "LLM API returned status %s: %s; falling back to heuristic engine.",
            response.status_code,
            response.text[:200],
        )
    except Exception as exc:
        logger.warning("LLM call failed (%s); using deterministic heuristic fallback.", exc)

    # Fallback to heuristic translator
    cypher, explanation = heuristic_nl_to_cypher(question)
    return validate_cypher_query(cypher), explanation
