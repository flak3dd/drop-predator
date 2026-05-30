#!/usr/bin/env python3
"""
Drop Predator -- Idea Conceptualisation & Manifestation CLI
============================================================
Terminal-based tool for deep idea capture, refinement, manifestation,
and review.  AI features powered by Mistral API (cloud) or Ollama (local).

Usage:
  idea add "My new idea" --tags brainstorm,tool
  idea elaborate <id> --ai
  idea manifest <id> --ai --output todo.md
  idea ask "What are my top 3 productivity ideas?"
  idea list --tags tool --priority 3
  idea show <id>
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import click
import requests
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
IDEAS_DIR = Path(os.getenv("IDEAS_DIR", Path.home() / ".ideas"))
IDEAS_FILE = IDEAS_DIR / "ideas.json"
ARCHIVE_FILE = IDEAS_DIR / "archive.json"
CACHE_DIR = IDEAS_DIR / "cache"
CONFIG_FILE = IDEAS_DIR / "config.json"

for _d in (IDEAS_DIR, CACHE_DIR, IDEAS_DIR / "templates", IDEAS_DIR / "exports"):
    _d.mkdir(parents=True, exist_ok=True)

console = Console()

# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "default_model": "mistral-tiny",
    "temperature": 0.7,
    "max_tokens": 500,
    "ai_backend": "auto",  # "auto" | "ollama" | "mistral"
}


def load_config() -> dict:
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            cfg = json.load(f)
        return {**DEFAULT_CONFIG, **cfg}
    return dict(DEFAULT_CONFIG)


CONFIG = load_config()

# ---------------------------------------------------------------------------
# AI helpers
# ---------------------------------------------------------------------------

# Rate-limiting state
_LAST_REQUEST_TIME: float = 0
_REQUEST_DELAY: float = 1.0  # seconds between API calls


def _rate_limit() -> None:
    global _LAST_REQUEST_TIME
    elapsed = time.time() - _LAST_REQUEST_TIME
    if elapsed < _REQUEST_DELAY:
        time.sleep(_REQUEST_DELAY - elapsed)
    _LAST_REQUEST_TIME = time.time()


def _cache_key(prompt: str, model: str) -> str:
    return hashlib.md5(f"{prompt}{model}".encode()).hexdigest()


def ask_mistral(
    prompt: str,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> str:
    """Query Mistral API (cloud)."""
    api_key = MISTRAL_API_KEY
    if not api_key:
        raise ValueError("MISTRAL_API_KEY not set -- add it to .env or environment")

    _rate_limit()
    resp = requests.post(
        "https://api.mistral.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": model or CONFIG["default_model"],
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature or CONFIG["temperature"],
            "max_tokens": max_tokens or CONFIG["max_tokens"],
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def ask_ollama(
    prompt: str,
    model: str = "mistral",
    **_kwargs,
) -> str:
    """Query a local Mistral model via Ollama."""
    result = subprocess.run(
        ["ollama", "run", model, prompt],
        capture_output=True,
        text=True,
        check=True,
        timeout=120,
    )
    return result.stdout.strip()


def ask_ai(prompt: str, **kwargs) -> str:
    """Unified AI helper -- tries backend per config, with caching."""
    model = kwargs.get("model", CONFIG["default_model"])
    key = _cache_key(prompt, model)
    cache_file = CACHE_DIR / f"{key}.txt"

    if cache_file.exists():
        return cache_file.read_text()

    backend = CONFIG["ai_backend"]
    response = ""

    if backend == "ollama":
        response = ask_ollama(prompt, **kwargs)
    elif backend == "mistral":
        response = ask_mistral(prompt, **kwargs)
    else:  # auto -- try ollama first, fall back to mistral
        try:
            response = ask_ollama(prompt, **kwargs)
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            try:
                response = ask_mistral(prompt, **kwargs)
            except Exception:
                return "AI Error: No AI backend available. Install Ollama or set MISTRAL_API_KEY."

    cache_file.write_text(response)
    return response


def ask_ai_with_spinner(prompt: str, **kwargs) -> str:
    """Show a spinner while waiting for AI response."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[cyan]Thinking..."),
        transient=True,
        console=console,
    ) as progress:
        progress.add_task("thinking", total=None)
        return ask_ai(prompt, **kwargs)


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def load_ideas() -> list[dict]:
    if not IDEAS_FILE.exists():
        return []
    with open(IDEAS_FILE) as f:
        return json.load(f)


def save_ideas(ideas: list[dict]) -> None:
    with open(IDEAS_FILE, "w") as f:
        json.dump(ideas, f, indent=2)


def load_archive() -> list[dict]:
    if not ARCHIVE_FILE.exists():
        return []
    with open(ARCHIVE_FILE) as f:
        return json.load(f)


def save_archive(ideas: list[dict]) -> None:
    with open(ARCHIVE_FILE, "w") as f:
        json.dump(ideas, f, indent=2)


def generate_id() -> str:
    return datetime.now().strftime("%Y%m%d%H%M%S%f")


def find_idea(ideas: list[dict], idea_id: str) -> dict | None:
    return next((i for i in ideas if i["id"] == idea_id), None)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

@click.group()
@click.version_option("0.1.0", prog_name="idea-manager")
def cli():
    """Terminal-based idea conceptualisation and manifestation tool."""


# ── Phase 1: Capture ──────────────────────────────────────────────────────────

@cli.command()
@click.argument("idea")
@click.option("--tags", default="", help="Comma-separated tags")
@click.option("--ai", "use_ai", is_flag=True, help="Use AI to suggest tags")
def add(idea: str, tags: str, use_ai: bool):
    """Add a new idea."""
    ideas = load_ideas()
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]

    if use_ai:
        prompt = (
            "Given the following idea, suggest 3-5 relevant tags "
            "(single words or short phrases, lowercase, no spaces). "
            "Separate tags with commas.\n\n"
            f"Idea: {idea}\n\n"
            "Output format:\ntag1,tag2,tag3"
        )
        ai_tags = ask_ai_with_spinner(prompt, max_tokens=100)
        tag_list.extend(t.strip() for t in ai_tags.split(",") if t.strip())

    idea_data = {
        "id": generate_id(),
        "content": idea,
        "tags": tag_list,
        "timestamp": datetime.now().isoformat(),
        "phase": "capture",
        "status": "raw",
    }
    ideas.append(idea_data)
    save_ideas(ideas)
    console.print(f"[bold green]Added idea:[/bold green] {idea} | Tags: {tag_list}")


@cli.command()
@click.argument("idea")
def quick(idea: str):
    """Quickly add an idea without tags."""
    ideas = load_ideas()
    idea_data = {
        "id": generate_id(),
        "content": idea,
        "tags": [],
        "timestamp": datetime.now().isoformat(),
        "phase": "capture",
        "status": "raw",
    }
    ideas.append(idea_data)
    save_ideas(ideas)
    console.print(f"[bold green]Added idea:[/bold green] {idea}")


# ── Phase 2: Refine ───────────────────────────────────────────────────────────

@cli.command()
@click.argument("idea_id")
@click.option("--ai", "use_ai", is_flag=True, help="Use AI to suggest sub-ideas")
@click.option("--sub-ideas", "manual_subs", default="", help="Comma-separated sub-ideas")
def elaborate(idea_id: str, use_ai: bool, manual_subs: str):
    """Break an idea into sub-ideas."""
    ideas = load_ideas()
    idea = find_idea(ideas, idea_id)
    if not idea:
        console.print("[red]Idea not found.[/red]")
        return

    if use_ai:
        prompt = (
            "You are an expert in idea refinement. "
            "Given the following idea, suggest 3-5 sub-ideas or components "
            "to break it down.\n\n"
            f"Idea: {idea['content']}\n\n"
            "Output format:\n- Sub-idea 1\n- Sub-idea 2\n- Sub-idea 3"
        )
        raw = ask_ai_with_spinner(prompt)
        sub_list = [s.strip("- ").strip() for s in raw.split("\n") if s.strip().startswith("-")]
        if not sub_list:
            sub_list = [s.strip() for s in raw.split("\n") if s.strip()]
    elif manual_subs:
        sub_list = [s.strip() for s in manual_subs.split(",") if s.strip()]
    else:
        console.print("Provide --ai or --sub-ideas to elaborate.")
        return

    idea["sub_ideas"] = sub_list
    idea["phase"] = "refine"
    idea["status"] = "elaborated"
    save_ideas(ideas)
    console.print("[bold cyan]Sub-ideas:[/bold cyan]")
    for s in sub_list:
        console.print(f"  - {s}")


@cli.command()
@click.argument("idea_id")
@click.option("--add", "add_tags", default="", help="Tags to add (comma-separated)")
@click.option("--remove", "remove_tags", default="", help="Tags to remove (comma-separated)")
@click.option("--ai", "use_ai", is_flag=True, help="Use AI to suggest tags")
def tag(idea_id: str, add_tags: str, remove_tags: str, use_ai: bool):
    """Add or remove tags from an idea."""
    ideas = load_ideas()
    idea = find_idea(ideas, idea_id)
    if not idea:
        console.print("[red]Idea not found.[/red]")
        return

    if use_ai:
        prompt = (
            "Given the following idea, suggest 3-5 relevant tags "
            "(single words or short phrases, lowercase, no spaces). "
            "Separate tags with commas.\n\n"
            f"Idea: {idea['content']}\n\n"
            "Output format:\ntag1,tag2,tag3"
        )
        ai_tags = ask_ai_with_spinner(prompt, max_tokens=100)
        for t in ai_tags.split(","):
            t = t.strip()
            if t and t not in idea["tags"]:
                idea["tags"].append(t)

    for t in add_tags.split(","):
        t = t.strip()
        if t and t not in idea["tags"]:
            idea["tags"].append(t)

    for t in remove_tags.split(","):
        t = t.strip()
        if t in idea["tags"]:
            idea["tags"].remove(t)

    save_ideas(ideas)
    console.print(f"[bold cyan]Tags updated:[/bold cyan] {idea['tags']}")


@cli.command()
@click.argument("idea_id1")
@click.argument("idea_id2")
@click.option("--type", "link_type", default="related_to", help="Link type (depends_on, related_to)")
def link(idea_id1: str, idea_id2: str, link_type: str):
    """Link two ideas together."""
    ideas = load_ideas()
    idea1 = find_idea(ideas, idea_id1)
    idea2 = find_idea(ideas, idea_id2)
    if not idea1 or not idea2:
        console.print("[red]One or both ideas not found.[/red]")
        return

    if "links" not in idea1:
        idea1["links"] = []
    idea1["links"].append({"to": idea_id2, "type": link_type})
    save_ideas(ideas)
    console.print(f"[bold cyan]Linked[/bold cyan] {idea_id1} [{link_type}] {idea_id2}")


@cli.command()
@click.argument("idea_id1")
@click.argument("idea_id2")
@click.option("--name", "merged_name", required=True, help="Name for the merged idea")
def merge(idea_id1: str, idea_id2: str, merged_name: str):
    """Merge two ideas into one."""
    ideas = load_ideas()
    idea1 = find_idea(ideas, idea_id1)
    idea2 = find_idea(ideas, idea_id2)
    if not idea1 or not idea2:
        console.print("[red]One or both ideas not found.[/red]")
        return

    merged_tags = list(set(idea1.get("tags", []) + idea2.get("tags", [])))
    merged_subs = idea1.get("sub_ideas", []) + idea2.get("sub_ideas", [])

    merged = {
        "id": generate_id(),
        "content": merged_name,
        "tags": merged_tags,
        "timestamp": datetime.now().isoformat(),
        "phase": "refine",
        "status": "merged",
        "sub_ideas": merged_subs,
        "merged_from": [idea_id1, idea_id2],
    }
    ideas = [i for i in ideas if i["id"] not in (idea_id1, idea_id2)]
    ideas.append(merged)
    save_ideas(ideas)
    console.print(f"[bold green]Merged into:[/bold green] {merged_name} (ID: {merged['id']})")


@cli.command()
@click.argument("idea_id")
@click.option("--priority", type=click.IntRange(1, 5), required=True, help="Priority 1-5")
def prioritize(idea_id: str, priority: int):
    """Set priority for an idea (1-5)."""
    ideas = load_ideas()
    idea = find_idea(ideas, idea_id)
    if not idea:
        console.print("[red]Idea not found.[/red]")
        return
    idea["priority"] = priority
    save_ideas(ideas)
    console.print(f"[bold cyan]Priority set to {priority}[/bold cyan] for: {idea['content']}")


# ── Phase 3: Manifest ─────────────────────────────────────────────────────────

@cli.command()
@click.argument("idea_id")
@click.option("--ai", "use_ai", is_flag=True, help="Use AI to generate steps")
@click.option("--output", "output_file", default=None, help="Output file (e.g. todo.md)")
def manifest(idea_id: str, use_ai: bool, output_file: str | None):
    """Generate actionable steps for an idea."""
    ideas = load_ideas()
    idea = find_idea(ideas, idea_id)
    if not idea:
        console.print("[red]Idea not found.[/red]")
        return

    if use_ai:
        prompt = (
            "Given the following idea, generate a step-by-step action plan "
            "with 3-5 concrete steps. Be specific and practical.\n\n"
            f"Idea: {idea['content']}\n\n"
            "Output format:\n1. Step 1\n2. Step 2\n3. Step 3"
        )
        steps = ask_ai_with_spinner(prompt)
    else:
        steps = f"Manifest idea: {idea['content']}\n\n(use --ai to generate steps)"

    if output_file:
        out = Path(output_file)
        out.write_text(f"# Action Plan for: {idea['content']}\n\n{steps}\n")
        console.print(f"[bold green]Action plan saved to[/bold green] {out}")
    else:
        console.print(steps)

    idea["phase"] = "manifest"
    save_ideas(ideas)


@cli.command("code")
@click.argument("idea_id")
@click.option("--language", default="python", help="Programming language")
@click.option("--output", "output_file", default=None, help="Output file (e.g. storage.py)")
def generate_code(idea_id: str, language: str, output_file: str | None):
    """Generate boilerplate code for an idea using AI."""
    ideas = load_ideas()
    idea = find_idea(ideas, idea_id)
    if not idea:
        console.print("[red]Idea not found.[/red]")
        return

    prompt = (
        f"Generate {language} code to implement the following idea. "
        "Include comments and follow best practices.\n\n"
        f"Idea: {idea['content']}"
    )
    code_snippet = ask_ai_with_spinner(prompt, max_tokens=1000)

    if output_file:
        out = Path(output_file)
        out.write_text(code_snippet + "\n")
        console.print(f"[bold green]Code saved to[/bold green] {out}")
    else:
        console.print(code_snippet)


@cli.command()
@click.argument("idea_id")
@click.option("--depth", default=2, help="Depth of mind map")
def mindmap(idea_id: str, depth: int):
    """Generate an ASCII mind map for an idea."""
    ideas = load_ideas()
    idea = find_idea(ideas, idea_id)
    if not idea:
        console.print("[red]Idea not found.[/red]")
        return

    prompt = (
        f"Generate an ASCII tree/mind map for the following idea, "
        f"with depth {depth}. Use tree-drawing characters.\n\n"
        f"Idea: {idea['content']}\n"
    )
    sub_ideas = idea.get("sub_ideas", [])
    if sub_ideas:
        prompt += f"Sub-ideas: {', '.join(sub_ideas)}\n"

    result = ask_ai_with_spinner(prompt, max_tokens=800)
    console.print(result)


# ── Phase 4: Review ───────────────────────────────────────────────────────────

@cli.command("list")
@click.option("--tags", default="", help="Filter by tag (comma-separated)")
@click.option("--priority", type=int, default=None, help="Filter by priority")
@click.option("--phase", default=None, help="Filter by phase (capture, refine, manifest)")
def list_ideas(tags: str, priority: int | None, phase: str | None):
    """List all ideas with optional filters."""
    ideas = load_ideas()
    if not ideas:
        console.print("No ideas found.")
        return

    tag_filter = [t.strip() for t in tags.split(",") if t.strip()]

    filtered = ideas
    if tag_filter:
        filtered = [i for i in filtered if any(t in i.get("tags", []) for t in tag_filter)]
    if priority is not None:
        filtered = [i for i in filtered if i.get("priority") == priority]
    if phase:
        filtered = [i for i in filtered if i.get("phase") == phase]

    if not filtered:
        console.print("No ideas match the filter.")
        return

    table = Table(title="Ideas")
    table.add_column("ID", style="dim")
    table.add_column("Idea", style="bold")
    table.add_column("Tags", style="cyan")
    table.add_column("Priority", justify="center")
    table.add_column("Phase", style="green")

    for i in filtered:
        table.add_row(
            i["id"],
            i["content"],
            ", ".join(i.get("tags", [])),
            str(i.get("priority", "-")),
            i.get("phase", "capture"),
        )
    console.print(table)


@cli.command()
@click.argument("idea_id")
def show(idea_id: str):
    """Show details of an idea."""
    ideas = load_ideas()
    idea = find_idea(ideas, idea_id)
    if not idea:
        console.print("[red]Idea not found.[/red]")
        return

    table = Table(title=f"Idea: {idea['content']}")
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("ID", idea["id"])
    table.add_row("Tags", ", ".join(idea.get("tags", [])))
    table.add_row("Timestamp", idea.get("timestamp", ""))
    table.add_row("Phase", idea.get("phase", "capture"))
    table.add_row("Status", idea.get("status", "raw"))
    table.add_row("Priority", str(idea.get("priority", "-")))

    if "sub_ideas" in idea:
        table.add_row("Sub-Ideas", "\n".join(f"  - {s}" for s in idea["sub_ideas"]))
    if "links" in idea:
        links_str = "\n".join(
            f"  {lnk['type']} -> {lnk['to']}" for lnk in idea["links"]
        )
        table.add_row("Links", links_str)
    if "merged_from" in idea:
        table.add_row("Merged From", ", ".join(idea["merged_from"]))

    console.print(table)


@cli.command()
@click.argument("keyword")
def search(keyword: str):
    """Search ideas by keyword."""
    ideas = load_ideas()
    kw = keyword.lower()
    results = [
        i for i in ideas
        if kw in i["content"].lower()
        or any(kw in t.lower() for t in i.get("tags", []))
    ]
    if not results:
        console.print("No matching ideas found.")
        return

    table = Table(title=f"Search: '{keyword}'")
    table.add_column("ID", style="dim")
    table.add_column("Idea", style="bold")
    table.add_column("Tags", style="cyan")
    table.add_column("Phase", style="green")

    for i in results:
        table.add_row(i["id"], i["content"], ", ".join(i.get("tags", [])), i.get("phase", ""))
    console.print(table)


@cli.command()
def stats():
    """Show statistics about your ideas."""
    ideas = load_ideas()
    if not ideas:
        console.print("No ideas found.")
        return

    phase_counts: dict[str, int] = {}
    tag_counts: dict[str, int] = {}
    for i in ideas:
        p = i.get("phase", "capture")
        phase_counts[p] = phase_counts.get(p, 0) + 1
        for t in i.get("tags", []):
            tag_counts[t] = tag_counts.get(t, 0) + 1

    console.print(f"[bold]Total ideas:[/bold] {len(ideas)}")
    console.print("[bold]By phase:[/bold]")
    for phase, count in sorted(phase_counts.items()):
        console.print(f"  - {phase}: {count}")
    console.print("[bold]By tag:[/bold]")
    for tag_name, count in sorted(tag_counts.items(), key=lambda x: x[1], reverse=True):
        console.print(f"  - {tag_name}: {count}")


@cli.command()
@click.argument("query")
def ask(query: str):
    """Ask AI a natural language question about your ideas."""
    ideas = load_ideas()
    if not ideas:
        console.print("No ideas in the database yet.")
        return

    ideas_str = "\n".join(
        f"- {i['content']} (Tags: {i.get('tags', [])}, Phase: {i.get('phase', 'capture')}, "
        f"Priority: {i.get('priority', 'unset')})"
        for i in ideas
    )
    prompt = (
        "You are a helpful assistant for a terminal-based idea manager. "
        "The user has the following ideas in their database:\n\n"
        f"{ideas_str}\n\n"
        "Answer the following query in a concise, structured way "
        "(e.g., lists, tables). If the query is ambiguous, ask for clarification.\n\n"
        f"Query: {query}"
    )
    response = ask_ai_with_spinner(prompt)
    console.print(response)


@cli.command()
@click.option("--format", "fmt", type=click.Choice(["json", "markdown", "csv"]), default="markdown")
@click.option("--output", "output_file", required=True, help="Output file path")
def export(fmt: str, output_file: str):
    """Export ideas to a file."""
    ideas = load_ideas()
    if not ideas:
        console.print("No ideas to export.")
        return

    out = Path(output_file)

    if fmt == "json":
        out.write_text(json.dumps(ideas, indent=2))
    elif fmt == "csv":
        import csv
        with open(out, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["id", "content", "tags", "phase", "status", "priority", "timestamp"])
            for i in ideas:
                writer.writerow([
                    i["id"],
                    i["content"],
                    ";".join(i.get("tags", [])),
                    i.get("phase", ""),
                    i.get("status", ""),
                    i.get("priority", ""),
                    i.get("timestamp", ""),
                ])
    else:  # markdown
        lines = ["# Ideas\n"]
        for i in ideas:
            lines.append(f"## {i['content']}")
            lines.append(f"- **ID**: {i['id']}")
            lines.append(f"- **Tags**: {', '.join(i.get('tags', []))}")
            lines.append(f"- **Phase**: {i.get('phase', 'capture')}")
            lines.append(f"- **Priority**: {i.get('priority', '-')}")
            if "sub_ideas" in i:
                lines.append("- **Sub-ideas**:")
                for s in i["sub_ideas"]:
                    lines.append(f"  - {s}")
            lines.append("")
        out.write_text("\n".join(lines))

    console.print(f"[bold green]Exported {len(ideas)} ideas to[/bold green] {out}")


@cli.command()
@click.argument("idea_id")
def archive(idea_id: str):
    """Move an idea to the archive."""
    ideas = load_ideas()
    idea = find_idea(ideas, idea_id)
    if not idea:
        console.print("[red]Idea not found.[/red]")
        return

    idea["status"] = "archived"
    archived = load_archive()
    archived.append(idea)
    save_archive(archived)

    ideas = [i for i in ideas if i["id"] != idea_id]
    save_ideas(ideas)
    console.print(f"[bold cyan]Archived:[/bold cyan] {idea['content']}")


# ── AI-enhanced commands ──────────────────────────────────────────────────────

@cli.command()
@click.argument("idea_id")
def expand(idea_id: str):
    """Use AI to expand an idea with deeper analysis."""
    ideas = load_ideas()
    idea = find_idea(ideas, idea_id)
    if not idea:
        console.print("[red]Idea not found.[/red]")
        return

    prompt = (
        "You are an expert in creative thinking and idea development. "
        "Given the following idea, provide:\n"
        "1. A deeper analysis of the core concept\n"
        "2. 3-5 potential applications or use cases\n"
        "3. Potential challenges and how to address them\n"
        "4. Resources or tools that could help\n\n"
        f"Idea: {idea['content']}\n"
    )
    sub_ideas = idea.get("sub_ideas", [])
    if sub_ideas:
        prompt += f"Existing sub-ideas: {', '.join(sub_ideas)}\n"

    response = ask_ai_with_spinner(prompt, max_tokens=1000)
    console.print(response)


@cli.command()
@click.argument("idea_text")
def summarize(idea_text: str):
    """Summarize a long idea description using AI."""
    prompt = (
        "Summarize the following idea in 2-3 concise sentences. "
        "Capture the core concept and key points.\n\n"
        f"Idea: {idea_text}"
    )
    response = ask_ai_with_spinner(prompt, max_tokens=200)
    console.print(response)


# ── Config command ────────────────────────────────────────────────────────────

@cli.command("config")
@click.option("--show", "show_config", is_flag=True, help="Show current config")
@click.option("--set-backend", type=click.Choice(["auto", "ollama", "mistral"]), help="Set AI backend")
@click.option("--set-model", help="Set default model")
def config_cmd(show_config: bool, set_backend: str | None, set_model: str | None):
    """View or update configuration."""
    cfg = load_config()

    if set_backend:
        cfg["ai_backend"] = set_backend
    if set_model:
        cfg["default_model"] = set_model

    if set_backend or set_model:
        with open(CONFIG_FILE, "w") as f:
            json.dump(cfg, f, indent=2)
        console.print("[bold green]Config updated.[/bold green]")

    if show_config or (not set_backend and not set_model):
        table = Table(title="Configuration")
        table.add_column("Key", style="cyan")
        table.add_column("Value", style="green")
        for k, v in cfg.items():
            table.add_row(k, str(v))
        console.print(table)


if __name__ == "__main__":
    cli()
