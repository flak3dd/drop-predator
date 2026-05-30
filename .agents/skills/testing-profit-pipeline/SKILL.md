---
name: testing-profit-pipeline
description: Test the profit pipeline and data source features of the drop-predator Shopify app. Use when verifying pipeline changes, new scanners/pathways, or data source wiring.
---

# Testing the Profit Pipeline (drop-predator)

## Architecture Overview

The profit pipeline is a 7-phase system: DISCOVER → SOURCE → VALIDATE → OPTIMIZE → LAUNCH → ENHANCE → REPORT.

Key components:
- **Intelligence scanners** (`app/services/intelligence/scanners/`) — Reddit, HN, Google Trends, TikTok, Instagram, YouTube, Pinterest, Twitter
- **Product sourcing pathways** (`app/services/engine/pathways/`) — Google Shopping, Trend Sourcing, AI Research, Amazon Bestsellers
- **Sentiment analysis** (`app/services/intelligence/sentiment.js`) — Orchestrates scanners, computes hype scores
- **Pipeline orchestrator** (`app/services/pipeline/profit-pipeline.js`) — Runs the full pipeline
- **UI** — PipelineTab (`app/components/command-center/PipelineTab.jsx`), Settings (`app/routes/app.settings.jsx`)

## Auth Constraints

This is a Shopify app. **All `/app/*` routes require `authenticate.admin(request)`** (Shopify OAuth session). The Vercel preview might have Vercel Authentication enabled too.

**UI testing via browser is NOT possible without:**
1. A Shopify development store
2. The app installed on that store
3. Valid Shopify OAuth session

If Shopify credentials are not available, testing is limited to:
- Build verification (`npm run build`)
- Unit/integration tests (`npx vitest run`)
- Runtime module verification via Node.js scripts

## Setup

```bash
cd /home/ubuntu/repos/drop-predator

# Node version — jsdom requires 20.19.0 || 22.13.0 || >=24.0.0
# If on wrong version:
nvm install 22.13.0 && nvm use 22.13.0

npm install
```

No `.env` file is needed for module-level testing (scanners degrade gracefully without API keys).

## Test Strategy (No Shopify Auth)

### 1. Build Verification
```bash
npm run build
```
Verify exit code 0 and that expected chunk files appear in output (e.g., scanner `.js` files).

### 2. Existing Test Suite
```bash
npx vitest run --reporter verbose
```
All existing tests should pass. Tests are in `tests/unit/` and `tests/integration/`.

### 3. Scanner/Pathway Module Interface Verification
Each scanner must export: `{ name: string, isAvailable(): boolean, search(keywords, deps): Promise<Signal[]> }`
Each pathway must export: `{ name: string, isAvailable(): boolean, search(keywords, opts): Promise<Product[]> }`

Verify via dynamic import:
```bash
node -e "
import('./app/services/intelligence/scanners/youtube.js').then(mod => {
  console.log('name:', mod.name);
  console.log('isAvailable:', mod.isAvailable());
  console.log('search:', typeof mod.search);
});
"
```

### 4. Graceful Degradation
Call `search()` with real keywords but no API keys. Should return `[]`, not throw.
```bash
node -e "
import('./app/services/intelligence/scanners/youtube.js').then(mod => {
  const deps = { createSignal: (s,d) => ({source:s,...d}), quickSentiment: () => 0.5 };
  mod.search(['test keyword'], deps).then(r => console.log('Result:', r));
});
"
```

### 5. Pathways Registry Wiring
Verify new pathways appear in the registry:
```bash
node -e "
import('./app/services/engine/pathways/index.js').then(mod => {
  console.log('Pathways:', mod.pathways.map(p => p.name));
});
"
```

### 6. Sentiment Config Flags
Verify `fullSentimentScan()` accepts new enable flags without crashing:
```bash
node -e "
import('./app/services/intelligence/sentiment.js').then(mod => {
  mod.fullSentimentScan({ keywords: [], subreddits: [], enableYouTube: true, enablePinterest: true, enableTwitter: true }).then(r => console.log('Signals:', r.length));
});
"
```

### 7. Hype Score Weights
Verify source weights are correctly applied via `createSignal` + `computeHypeScore`:
```bash
node -e "
import('./app/services/intelligence/sentiment.js').then(mod => {
  const sig = mod.createSignal('youtube', { keyword:'test', title:'Test', body:'', score:100, comments:10, sentiment:0.5, url:'http://x', ts:Date.now(), raw:{} });
  console.log('Hype:', mod.computeHypeScore(sig));
});
"
```

## Key Files

| File | Purpose |
|------|---------|
| `app/services/intelligence/scanners/*.js` | Individual data source scanners |
| `app/services/intelligence/sentiment.js` | Scanner orchestration + hype scoring |
| `app/services/intelligence/index.js` | Intelligence facade |
| `app/services/engine/pathways/*.js` | Product sourcing pathways |
| `app/services/engine/pathways/index.js` | Pathway registry |
| `app/services/pipeline/profit-pipeline.js` | Full pipeline orchestrator |
| `app/components/command-center/PipelineTab.jsx` | Pipeline UI (toggle chips) |
| `app/routes/app.settings.jsx` | Settings page (data source list) |
| `app/routes/app.command-center.jsx` | Command center route (tabs) |

## Known Issues / Gotchas

- Node version matters: jsdom (used by vitest) requires specific Node versions. Use `nvm` to switch if build/tests fail with version errors.
- Pre-existing lint errors: The codebase may have pre-existing eslint errors in files like `profit-pipeline.js` and `sentiment.js`. New scanner files use `/* eslint-disable no-undef */` to match existing convention for `process.env` usage.
- No `.env` file in repo: API keys are expected as environment variables. All scanners/pathways handle missing keys gracefully.
- All testing is shell-only when no Shopify auth — do not start screen recordings.

## Devin Secrets Needed

- None required for module-level testing
- `SHOPIFY_API_KEY` + `SHOPIFY_API_SECRET` (optional) — only needed for full UI testing via Shopify admin
- Various API keys (optional) — `ENSEMBLEDATA_API_KEY`, `YOUTUBE_API_KEY`, `PINTEREST_ACCESS_TOKEN`, `RAPID_API_KEY`, `SERPAPI_KEY` — only needed to test actual data fetching from sources
