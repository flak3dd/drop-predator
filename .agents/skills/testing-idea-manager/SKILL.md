---
name: testing-idea-manager
description: Test the idea-manager CLI tool end-to-end. Use when verifying idea-manager changes or running regression tests.
---

# Testing the Idea Manager CLI

## Setup

```bash
# Install the tool in editable mode
pip install -e /home/ubuntu/drop-predator/python/idea-manager

# Clean previous test data before each test run
rm -rf ~/.ideas
```

The tool stores data in `~/.ideas/` (ideas.json, archive.json, config.json, cache/).

## Key Commands & Syntax

| Command | Example | Notes |
|---------|---------|-------|
| `idea add` | `idea add "My idea" --tags tag1,tag2` | Tags are comma-separated, no spaces |
| `idea quick` | `idea quick "Fast idea"` | Adds without tag prompt |
| `idea elaborate` | `idea elaborate <ID> --sub-ideas "a,b,c"` | Use `--ai` for AI elaboration |
| `idea tag` | `idea tag <ID> --add "t1,t2"` | Appends tags |
| `idea prioritize` | `idea prioritize <ID> --priority 3` | Range: 1-5 (Click enforced) |
| `idea link` | `idea link <ID1> <ID2>` | Creates bidirectional link |
| `idea merge` | `idea merge <ID1> <ID2> --name "Combined"` | `--name` is required |
| `idea manifest` | `idea manifest <ID> --ai` | Requires AI backend |
| `idea code` | `idea code <ID>` | Requires AI backend |
| `idea list` | `idea list` | Rich table output |
| `idea show` | `idea show <ID>` | Detailed view |
| `idea search` | `idea search "keyword"` | Content search |
| `idea stats` | `idea stats` | Phase/tag breakdown |
| `idea export` | `idea export --format json --output out.json` | `--output` is required, formats: json/csv/markdown |
| `idea archive` | `idea archive <ID>` | Moves to archive.json |
| `idea ask` | `idea ask "question"` | Requires AI backend |
| `idea config` | `idea config --set-model mistral-medium` | Use `--set-model` or `--set-backend` |
| `idea --version` | `idea --version` | Shows version |

## Getting Idea IDs

IDs are datetime-based with microsecond precision (e.g., `20260530021501950961`). To extract programmatically:

```bash
IDEA_ID=$(python3 -c "import json; data=json.load(open('/home/ubuntu/.ideas/ideas.json')); print(data[0]['id'])")
```

## Data Model

The JSON storage (`~/.ideas/ideas.json`) is a flat list (not `{"ideas": [...]}`):
```json
[
  {
    "id": "20260530021501950961",
    "content": "My idea",
    "tags": ["tag1"],
    "timestamp": "2026-05-30T02:15:01.950991",
    "phase": "capture",
    "status": "raw"
  }
]
```

## Phase/Status Transitions

- `add` → phase=`capture`, status=`raw`
- `elaborate` → phase=`refine`, status=`elaborated`
- `manifest` → phase=`manifest`

## Test Flows

### 1. Full Lifecycle
add → elaborate (--sub-ideas) → tag → prioritize → link → search → stats → export → archive

Verify JSON persistence at each step. Check phase/status transitions.

### 2. Merge
Add two ideas (with slight delay to avoid ID collision if microsecond precision might not be enough), merge them, verify:
- Tags are unioned
- Originals removed
- `merged_from` field populated

### 3. AI Graceful Degradation
Without Mistral API key or Ollama, all AI commands should exit 0 with message: "No AI backend available. Install Ollama or set MISTRAL_API_KEY."

Test: `elaborate --ai`, `manifest --ai`, `code`, `ask`

### 4. Config
`idea config` shows table. `idea config --set-model X` updates. Re-run `idea config` to verify persistence.

### 5. Edge Cases
- Invalid ID → "Idea not found." (exit 0)
- Priority out of range → Click validation error (exit 2)
- CSV export → headers + semicolon-separated tags
- `--version` flag

## Known Issues / Gotchas

- The `--name` flag is required for `idea merge` (not positional)
- The `--output` flag is required for `idea export`
- Config uses `--set-model` and `--set-backend`, not `--set key=value`
- No GUI involved — all testing is shell-only (do not start screen recordings)

## Devin Secrets Needed

- `MISTRAL_API_KEY` (optional) — only needed to test AI features with cloud backend
- Ollama (optional) — only needed to test local AI features
