# Idea Manager -- Terminal-Based Idea Conceptualisation & Manifestation

A CLI tool for deep idea capture, refinement, manifestation, and review with
optional AI-powered features (Mistral API or local Ollama).

## Workflow

The tool is organised into four phases:

1. **Capture** -- quickly log raw ideas (`add`, `quick`)
2. **Refine** -- break down, tag, link, merge, and prioritise ideas
   (`elaborate`, `tag`, `link`, `merge`, `prioritize`)
3. **Manifest** -- generate actionable outputs
   (`manifest`, `code`, `mindmap`)
4. **Review** -- search, filter, and analyse ideas
   (`list`, `show`, `search`, `stats`, `ask`, `export`, `archive`)

## Quick Start

```bash
# Install dependencies
pip install -e .

# Add an idea
idea add "Build a terminal-based idea manager" --tags brainstorm,tool

# Add with AI-suggested tags
idea add "Automate my workflow" --ai

# List ideas
idea list

# Elaborate with AI
idea elaborate <ID> --ai

# Generate action plan
idea manifest <ID> --ai --output todo.md

# Generate code
idea code <ID> --language python --output storage.py

# Ask a question
idea ask "What are my top 3 productivity ideas?"
```

## AI Setup

### Option 1: Mistral API (Cloud)

Set your API key:

```bash
export MISTRAL_API_KEY="your_key_here"
```

### Option 2: Ollama (Local)

```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull mistral
```

### Configuration

```bash
idea config --show                      # View config
idea config --set-backend ollama        # Use local Ollama
idea config --set-backend mistral       # Use Mistral API
idea config --set-model mistral-tiny    # Change model
```

## Docker

```bash
# Build and run
docker compose up --build

# Run a command
docker compose run idea-manager add "My idea" --tags test
```

## Data Storage

Ideas are stored in `~/.ideas/ideas.json`. Archived ideas go to
`~/.ideas/archive.json`. AI response caches live in `~/.ideas/cache/`.

## All Commands

| Command      | Description                                    |
|------------- |------------------------------------------------|
| `add`        | Add a new idea (optionally with AI tags)       |
| `quick`      | Quick-add without tags                         |
| `elaborate`  | Break into sub-ideas (AI or manual)            |
| `tag`        | Add/remove tags (AI or manual)                 |
| `link`       | Link two ideas                                 |
| `merge`      | Merge two ideas into one                       |
| `prioritize` | Set priority (1-5)                             |
| `manifest`   | Generate action plan (AI)                      |
| `code`       | Generate boilerplate code (AI)                 |
| `mindmap`    | Generate ASCII mind map (AI)                   |
| `list`       | List ideas with filters                        |
| `show`       | Show idea details                              |
| `search`     | Search by keyword                              |
| `stats`      | Show statistics                                |
| `ask`        | Natural language query (AI)                    |
| `export`     | Export to JSON/Markdown/CSV                    |
| `archive`    | Archive an idea                                |
| `expand`     | Deep AI analysis of an idea                    |
| `summarize`  | Summarize a long description (AI)              |
| `config`     | View/update configuration                      |
