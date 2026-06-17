# Phaser Agents

## Runtime Modes

The visual layer can run against either the local mock simulation or a real agentic event stream.

- `MOCK`: replays the local research workflow in `src/mockAgenticRuntime.js`.
- `REAL`: connects to a server-sent events endpoint configured by `VITE_AGENTIC_REAL_ENDPOINT`.

The default mode is `MOCK`. Copy the example env file and set `ANTHROPIC_API_KEY` to use the real adapter:

```sh
cp .env.example .env
npm run dev
```

Then switch to `REAL` in the UI. You can also set `VITE_AGENTIC_RUNTIME=real` in `.env` to boot into the real adapter by default.

The local real workflow uses these optional budget/model controls:

```sh
AGENTIC_RESEARCH_RUN_BUDGET_USD=1
AGENTIC_RESEARCH_PROJECT_BUDGET_USD=80
AGENTIC_RESEARCH_SCOUT_MODEL=claude-haiku-4-5-20251001
AGENTIC_RESEARCH_RETRIEVAL_MODEL=claude-sonnet-4-6
AGENTIC_RESEARCH_SYNTHESIS_MODEL=claude-sonnet-4-6
AGENTIC_RESEARCH_WEB_SEARCH_TOOL=web_search_20250305
AGENTIC_RESEARCH_EVIDENCE_SEARCHES=2
AGENTIC_RESEARCH_WEB_SEARCH_INPUT_TOKEN_BUFFER=12000
AGENTIC_RESEARCH_STEP_TIMEOUT_MS=180000
```

Spend is tracked in `.agentic-budget-ledger.json`, which is ignored by git. The default guard allows at most `$1` per real run and `$80` total in the local project ledger. The estimate includes Anthropic token usage, web-search requests at `$0.01` per search, and a configurable input-token buffer for retrieved search context.

Type the research question into the footer input, switch to `REAL`, then press `RUN`. The Evidence lane uses focused Anthropic web-search calls with one search per call and `AGENTIC_RESEARCH_EVIDENCE_SEARCHES=2` by default, so that lane can return cited/source-backed findings without one oversized retrieval request. The Architecture and Risk lanes remain cheaper model-internal passes. If every web-backed Evidence search fails or times out, the workflow records a degraded evidence artifact and still lets Perfection synthesize from the partial run with an explicit uncertainty warning.

Real workflow outputs are written to `.agentic-runs/`, also ignored by git. Each run gets a JSON artifact containing:

- task, timestamps, status, models, and cost
- every streamed event shown in the visual layer
- named artifacts for brief, strategy, lane outputs, synthesis, and citation check

The real endpoint should emit JSON events using the shared contract in `src/events/agenticEvents.js`. The visual layer currently reacts to:

- `workflow.started`
- `agent.started`
- `artifact.created`
- `signal.transferred`
- `workflow.completed`
- `workflow.reset`

For `signal.transferred`, provide `from`, `to`, `phase`, and `message`. Valid agent ids are `purification`, `illumination`, and `perfection`.

Example SSE payload:

```txt
event: agentic-event
data: {"type":"signal.transferred","from":"purification","to":"illumination","phase":"Brief handed off","message":"Clean brief sent upward for strategy."}

```
