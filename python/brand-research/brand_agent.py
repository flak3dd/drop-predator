"""
ADK-based brand research agent for Drop Predator.

Adapted from google/adk-samples brand-search-optimization:
  - Removes BigQuery dependency (products supplied inline via HTTP)
  - Removes Selenium dependency (search intelligence from ADK LLM reasoning)
  - Runs keyword, title-optimisation, and market-insight sub-agents in parallel
  - Works with Google AI Studio (GOOGLE_API_KEY) or Vertex AI (gcloud ADC)
"""

from __future__ import annotations

import asyncio
import json
import os
import re

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ── Backend selection ─────────────────────────────────────────────────────────
# Prefer AI Studio (no gcloud needed) when GOOGLE_API_KEY is set.
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_USE_VERTEXAI"):
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "0"

# Never spin up Selenium — search intelligence comes from Gemini reasoning
os.environ["DISABLE_WEB_DRIVER"] = "1"

MODEL = os.getenv("MODEL", "gemini-2.5-flash")

# Lazy imports so import errors surface cleanly at request time
_adk_available: bool | None = None


def _check_adk() -> bool:
    global _adk_available
    if _adk_available is None:
        try:
            import google.adk  # noqa: F401
            _adk_available = True
        except ImportError:
            _adk_available = False
    return _adk_available


# ── JSON extraction ───────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict | list:
    """Parse JSON from model output, stripping markdown code fences."""
    clean = re.sub(r"```(?:json)?\s*\n?(.*?)\n?```", r"\1", text, flags=re.DOTALL).strip()
    # Find the first { or [ and last } or ]
    start = min(
        (clean.find("{") if "{" in clean else len(clean)),
        (clean.find("[") if "[" in clean else len(clean)),
    )
    return json.loads(clean[start:])


# ── ADK runner helper ─────────────────────────────────────────────────────────

async def _run_adk_agent(agent, query: str) -> str:
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    session_service = InMemorySessionService()
    runner = Runner(
        agent=agent,
        app_name="drop_predator_brand_research",
        session_service=session_service,
    )
    session = await session_service.create_session(
        app_name="drop_predator_brand_research",
        user_id="dp-engine",
    )
    content = types.Content(role="user", parts=[types.Part.from_text(text=query)])

    response_text = ""
    async for event in runner.run_async(
        user_id="dp-engine",
        session_id=session.id,
        new_message=content,
    ):
        if event.is_final_response() and event.content and event.content.parts:
            response_text = event.content.parts[0].text
            break

    return response_text


# ── Sub-agent factory ─────────────────────────────────────────────────────────

def _make_agents():
    from google.adk.agents.llm_agent import Agent
    from prompts import (
        INSIGHTS_AGENT_PROMPT,
        KEYWORD_AGENT_PROMPT,
        TITLE_AGENT_PROMPT,
    )

    keyword_agent = Agent(
        model=MODEL,
        name="keyword_research_agent",
        description="Finds high-intent buyer keywords for dropshipping products.",
        instruction=KEYWORD_AGENT_PROMPT,
    )
    title_agent = Agent(
        model=MODEL,
        name="title_optimisation_agent",
        description="Generates SEO-optimised Shopify product titles.",
        instruction=TITLE_AGENT_PROMPT,
    )
    insights_agent = Agent(
        model=MODEL,
        name="market_insights_agent",
        description="Provides market intelligence for a product niche.",
        instruction=INSIGHTS_AGENT_PROMPT,
    )
    return keyword_agent, title_agent, insights_agent


# ── Main analysis function ────────────────────────────────────────────────────

async def run_brand_analysis(niche: str, products: list[dict]) -> dict:
    """
    Run all three ADK sub-agents in parallel for the given niche + products.
    Returns merged results dict.
    """
    if not _check_adk():
        raise RuntimeError(
            "google-adk package not installed. Run: "
            "uv pip install 'google-adk>=1.31.0'"
        )

    # Build shared context string
    product_lines = "\n".join(
        f"  - {p['name']} | category: {p.get('category', niche)} "
        f"| supplier: {p.get('supplier', 'unknown')} "
        f"| price: ${p.get('price', 0):.2f}"
        for p in products[:10]
    )
    context = f"Niche: {niche}\n\nProducts:\n{product_lines}"
    title_context = (
        f"{context}\n\nTarget keywords: {niche}, best {niche} products, "
        f"buy {niche} online"
    )

    keyword_agent, title_agent, insights_agent = _make_agents()

    kw_raw, title_raw, insights_raw = await asyncio.gather(
        _run_adk_agent(keyword_agent, context),
        _run_adk_agent(title_agent, title_context),
        _run_adk_agent(insights_agent, context),
        return_exceptions=True,
    )

    keywords: list = []
    optimized_titles: list = []
    insights: dict = {}

    try:
        if isinstance(kw_raw, str) and kw_raw:
            keywords = _extract_json(kw_raw).get("keywords", [])
    except Exception as exc:
        print(f"[brand-agent] keyword parse error: {exc} — raw: {kw_raw!r:.200}")

    try:
        if isinstance(title_raw, str) and title_raw:
            optimized_titles = _extract_json(title_raw).get("optimized", [])
    except Exception as exc:
        print(f"[brand-agent] title parse error: {exc} — raw: {title_raw!r:.200}")

    try:
        if isinstance(insights_raw, str) and insights_raw:
            insights = _extract_json(insights_raw)
    except Exception as exc:
        print(f"[brand-agent] insights parse error: {exc} — raw: {insights_raw!r:.200}")

    return {
        "niche": niche,
        "product_count": len(products),
        "keywords": keywords,
        "optimized_titles": optimized_titles,
        "insights": insights,
    }
