"""OpenAI-compatible LLM client for NL-to-Cypher translation with heuristic fallback."""

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
- (:Agent)-[:USES]->(:Model)
- (:Agent)-[:CAN_CALL]->(:Tool)
- (:Tool)-[:READS]->(:DataSource)
- (:Tool)-[:WRITES]->(:DataSource)
- (:Agent)-[:GOVERNED_BY]->(:Policy)
- (:Tool)-[:GOVERNED_BY]->(:Policy)
- (:DataSource)-[:GOVERNED_BY]->(:Policy)
- (:Model)-[:GOVERNED_BY]->(:Policy)

Instructions:
1. Generate ONLY valid, read-only Cypher queries.
2. NEVER use write operations (CREATE, MERGE, SET, DELETE, DETACH, REMOVE, DROP, ALTER).
3. Always include a RETURN clause returning the relevant nodes and relationships.
4. Output your answer in JSON format with two keys:
   {
     "cypher": "MATCH ... RETURN ...",
     "explanation": "Brief natural language explanation of how the query answers the user question."
   }
"""


def heuristic_nl_to_cypher(question: str) -> tuple[str, str]:
    """Deterministic fallback NL-to-Cypher generator for standard governance queries."""
    q_lower = question.lower().strip()

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
        "MATCH (n) RETURN n LIMIT 25",
        "Exploring top governance entities across the graph.",
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

    # If no LLM key configured or offline demo mode, use heuristic fallback
    if not api_key:
        logger.info("No LLM API key configured; using deterministic heuristic translator.")
        cypher, explanation = heuristic_nl_to_cypher(question)
        return validate_cypher_query(cypher), explanation

    # Call OpenAI-compatible endpoint
    base_url = settings.LLM_BASE_URL.rstrip("/")
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
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(endpoint, json=payload, headers=headers)

        if response.status_code == 200:
            data = response.json()
            raw_content = data["choices"][0]["message"]["content"]
            parsed_json = json.loads(raw_content)

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
