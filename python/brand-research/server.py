"""
Drop Predator – Brand Research HTTP Service
==========================================
Wraps the ADK-based brand-research agent in a FastAPI server so the
Node.js engine pipeline can call it via HTTP.

Usage:
  uv run server.py           # starts on port 8765 (or $BRAND_RESEARCH_PORT)
  uv run uvicorn server:app  # via uvicorn directly

Endpoints:
  GET  /health      → { ok: true }
  POST /analyze     → runs all three ADK sub-agents, returns combined results
  POST /keywords    → keyword research only (faster)
  POST /titles      → title optimisation only (faster)
"""

from __future__ import annotations

import os
import sys

# Make brand_agent importable from the same directory
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="Drop Predator Brand Research",
    description="ADK-powered keyword research, title optimisation, and market insights",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class Product(BaseModel):
    name: str
    category: str = ""
    supplier: str = ""
    price: float = 0.0
    cost: float = 0.0
    sources: list[str] = []


class AnalyzeRequest(BaseModel):
    niche: str
    products: list[Product]


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "service": "brand-research", "model": os.getenv("MODEL", "gemini-2.5-flash")}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """
    Full analysis: keyword research + title optimisation + market insights.
    Runs three ADK sub-agents in parallel (~10-20s depending on Gemini latency).
    """
    if not req.products:
        raise HTTPException(status_code=400, detail="products list must not be empty")

    try:
        from brand_agent import run_brand_analysis
        result = await run_brand_analysis(
            req.niche,
            [p.model_dump() for p in req.products],
        )
        return {"ok": True, **result}
    except Exception as exc:
        # Return degraded result so the engine pipeline can continue
        print(f"[brand-research] analyze error: {exc}")
        return {
            "ok": False,
            "error": str(exc),
            "niche": req.niche,
            "product_count": len(req.products),
            "keywords": [],
            "optimized_titles": [],
            "insights": {},
        }


@app.post("/keywords")
async def keywords_only(req: AnalyzeRequest):
    """Keyword research only — faster than full analysis."""
    try:
        from brand_agent import _check_adk, _make_agents, _run_adk_agent, _extract_json, MODEL
        if not _check_adk():
            raise RuntimeError("google-adk not installed")

        product_lines = "\n".join(
            f"  - {p.name} ({p.category or req.niche})" for p in req.products[:10]
        )
        context = f"Niche: {req.niche}\n\nProducts:\n{product_lines}"
        keyword_agent, _, _ = _make_agents()
        raw = await _run_adk_agent(keyword_agent, context)
        keywords = _extract_json(raw).get("keywords", []) if raw else []
        return {"ok": True, "niche": req.niche, "keywords": keywords}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "keywords": []}


@app.post("/titles")
async def titles_only(req: AnalyzeRequest):
    """Title optimisation only — faster than full analysis."""
    try:
        from brand_agent import _check_adk, _make_agents, _run_adk_agent, _extract_json
        if not _check_adk():
            raise RuntimeError("google-adk not installed")

        product_lines = "\n".join(
            f"  - {p.name} (${p.price:.2f})" for p in req.products[:10]
        )
        context = (
            f"Niche: {req.niche}\n\nProducts:\n{product_lines}\n\n"
            f"Target keywords: {req.niche}, best {req.niche} products"
        )
        _, title_agent, _ = _make_agents()
        raw = await _run_adk_agent(title_agent, context)
        optimized = _extract_json(raw).get("optimized", []) if raw else []
        return {"ok": True, "niche": req.niche, "optimized_titles": optimized}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "optimized_titles": []}


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("BRAND_RESEARCH_PORT", "8765"))
    print(f"[brand-research] Starting on http://0.0.0.0:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
