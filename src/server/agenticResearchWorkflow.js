import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ENDPOINT = '/api/agentic/research/events';
const LEDGER_PATH = path.resolve(process.cwd(), '.agentic-budget-ledger.json');
const RUNS_DIR = path.resolve(process.cwd(), '.agentic-runs');

const DEFAULT_TASK =
  'Research when a small multi-agent workflow is useful for complex research tasks, using a lead/subagent architecture as the reference pattern.';

const DEFAULT_SCOUT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_SYNTHESIS_MODEL = 'claude-sonnet-4-6';
const DEFAULT_RETRIEVAL_MODEL = DEFAULT_SYNTHESIS_MODEL;
const DEFAULT_WEB_SEARCH_TOOL = 'web_search_20250305';
const DEFAULT_STEP_TIMEOUT_MS = 180_000;
const DEFAULT_EVIDENCE_SEARCHES = 2;
const DEFAULT_WEB_SEARCH_INPUT_TOKEN_BUFFER = 12_000;
const WEB_SEARCH_COST_PER_REQUEST_USD = 10 / 1_000;

const PRICING_BY_FAMILY = [
  { test: 'haiku', input: 1, output: 5 },
  { test: 'sonnet', input: 3, output: 15 },
  { test: 'opus', input: 5, output: 25 },
  { test: 'fable', input: 10, output: 50 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getPricing(model) {
  const normalized = model.toLowerCase();
  return PRICING_BY_FAMILY.find(({ test }) => normalized.includes(test)) ?? PRICING_BY_FAMILY[0];
}

function estimateTokens(text) {
  return Math.ceil(String(text).length / 4);
}

function estimateToolMaxCost(tools = [], pricing) {
  const searchInputTokenBuffer = Number(
    process.env.AGENTIC_RESEARCH_WEB_SEARCH_INPUT_TOKEN_BUFFER || DEFAULT_WEB_SEARCH_INPUT_TOKEN_BUFFER,
  );
  return tools.reduce((total, tool) => {
    if (!String(tool.type || '').startsWith('web_search_')) return total;
    const maxUses = Number(tool.max_uses || 0);
    return total + (
      maxUses * WEB_SEARCH_COST_PER_REQUEST_USD
      + (maxUses * searchInputTokenBuffer / 1_000_000) * pricing.input
    );
  }, 0);
}

function estimateMaxCost(model, prompt, maxTokens, tools = []) {
  const pricing = getPricing(model);
  return (
    (estimateTokens(prompt) / 1_000_000) * pricing.input
    + (maxTokens / 1_000_000) * pricing.output
    + estimateToolMaxCost(tools, pricing)
  );
}

function usageCost(model, usage = {}) {
  const pricing = getPricing(model);
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const webSearchRequests = usage.server_tool_use?.web_search_requests ?? 0;
  return (
    (inputTokens / 1_000_000) * pricing.input
    + (outputTokens / 1_000_000) * pricing.output
    + (webSearchRequests * WEB_SEARCH_COST_PER_REQUEST_USD)
  );
}

async function readLedger() {
  try {
    return JSON.parse(await fs.readFile(LEDGER_PATH, 'utf8'));
  } catch {
    return { totalUsd: 0, runs: [] };
  }
}

async function appendLedgerRun(run) {
  const ledger = await readLedger();
  ledger.totalUsd = Number(((ledger.totalUsd ?? 0) + run.costUsd).toFixed(6));
  ledger.runs = [...(ledger.runs ?? []), run].slice(-200);
  await fs.writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'research-run';
}

async function writeRunArtifact(run) {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const safeStartedAt = run.startedAt.replace(/[:.]/g, '-');
  const filename = `${safeStartedAt}-${slugify(run.task)}.json`;
  const filePath = path.join(RUNS_DIR, filename);
  await fs.writeFile(filePath, `${JSON.stringify(run, null, 2)}\n`);
  return filePath;
}

function createRunRecorder({ task, scoutModel, retrievalModel, synthesisModel, runBudgetUsd, projectBudgetUsd }) {
  return {
    id: crypto.randomUUID(),
    task,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'running',
    costUsd: 0,
    budget: {
      runBudgetUsd,
      projectBudgetUsd,
    },
    models: {
      scout: scoutModel,
      retrieval: retrievalModel,
      synthesis: synthesisModel,
    },
    events: [],
    artifacts: {
      brief: null,
      strategy: null,
      lanes: [],
      synthesis: null,
      citationCheck: null,
    },
    recordEvent(event) {
      this.events.push(event);
    },
    recordArtifact(key, value) {
      if (key === 'lanes') {
        this.artifacts.lanes.push(value);
        return;
      }
      this.artifacts[key] = value;
    },
    finish(status, costUsd) {
      this.status = status;
      this.costUsd = Number(costUsd.toFixed(6));
      this.completedAt = new Date().toISOString();
    },
  };
}

function createSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  return {
    send(event) {
      res.write(`event: agentic-event\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    close() {
      res.end();
    },
  };
}

function createEvent(type, payload) {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source: 'anthropic-research-workflow',
    dwellMs: 2800,
    speed: 1.15,
    type,
    ...payload,
  };
}

function runtimeError(phase, message) {
  return createEvent('runtime.error', { phase, message });
}

function laneWarning(phase, message) {
  return createEvent('lane.warning', { phase, message });
}

function describeFetchError(error) {
  const parts = [error?.message, error?.cause?.message, error?.cause?.code]
    .filter(Boolean)
    .map(String);
  return [...new Set(parts)].join(' / ') || 'Unknown Anthropic API error.';
}

function createStepSignal(parentSignal, timeoutMs, phase) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`${phase} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
  }, timeoutMs);

  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

function extractWebSearchSources(content = []) {
  const sources = new Map();

  const remember = (source) => {
    const url = source.url || source.uri;
    if (!url) return;
    sources.set(url, {
      url,
      title: source.title || url,
      pageAge: source.page_age,
      citedText: source.cited_text,
    });
  };

  for (const block of content) {
    if (block.type === 'web_search_tool_result') {
      const results = Array.isArray(block.content) ? block.content : [block.content];
      results.filter(Boolean).forEach(remember);
    }
    if (Array.isArray(block.citations)) {
      block.citations.forEach(remember);
    }
  }

  return [...sources.values()];
}

function webSearchTools(maxUses) {
  const toolType = process.env.AGENTIC_RESEARCH_WEB_SEARCH_TOOL || DEFAULT_WEB_SEARCH_TOOL;
  return [{
    type: toolType,
    name: 'web_search',
    max_uses: maxUses,
  }];
}

async function callClaude({ apiKey, model, system, prompt, maxTokens, signal, tools = [], timeoutMs, phase }) {
  const stepSignal = createStepSignal(signal, timeoutMs, phase);
  let response;

  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: stepSignal.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
        ...(tools.length > 0 && { tools }),
      }),
    });
  } catch (error) {
    if (stepSignal.signal.aborted && stepSignal.signal.reason instanceof Error) {
      throw stepSignal.signal.reason;
    }
    throw new Error(describeFetchError(error));
  } finally {
    stepSignal.cleanup();
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.error?.message || response.statusText || 'Unknown Anthropic API error.';
    throw new Error(detail);
  }

  const text = (body.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return {
    text,
    usage: body.usage ?? {},
    sources: extractWebSearchSources(body.content),
    content: body.content ?? [],
    costUsd: usageCost(model, body.usage),
  };
}

function createBudgetGuard({ runBudgetUsd, projectBudgetUsd, priorSpendUsd, send }) {
  let spentUsd = 0;
  const remainingProjectUsd = Math.max(0, projectBudgetUsd - priorSpendUsd);
  const effectiveRunBudgetUsd = Math.min(runBudgetUsd, remainingProjectUsd);

  return {
    get spentUsd() {
      return spentUsd;
    },
    get effectiveRunBudgetUsd() {
      return effectiveRunBudgetUsd;
    },
    assertCanCall(model, prompt, maxTokens, phase, tools = []) {
      const projected = estimateMaxCost(model, prompt, maxTokens, tools);
      if (spentUsd + projected > effectiveRunBudgetUsd) {
        send(runtimeError(
          'Budget guard stopped run',
          `${phase} could cost up to $${projected.toFixed(4)}, exceeding the remaining run budget of $${Math.max(0, effectiveRunBudgetUsd - spentUsd).toFixed(4)}.`,
        ));
        return false;
      }
      return true;
    },
    record(costUsd) {
      spentUsd += costUsd;
    },
  };
}

function recordSyntheticArtifact({
  send,
  recorder,
  artifactKey,
  agentId,
  phase,
  model,
  artifact,
  sources = [],
  budget,
  synthetic = true,
}) {
  send(createEvent('artifact.created', {
    agentId,
    phase,
    artifact,
    usage: {},
    sources,
    estimatedCostUsd: 0,
    runCostUsd: Number(budget.spentUsd.toFixed(6)),
  }));
  recorder.recordArtifact(artifactKey, {
    agentId,
    phase,
    model,
    text: artifact,
    usage: {},
    sources,
    estimatedCostUsd: 0,
    runCostUsd: Number(budget.spentUsd.toFixed(6)),
    synthetic,
  });
  return artifact;
}

async function runStep({
  budget,
  send,
  recorder,
  artifactKey,
  apiKey,
  model,
  agentId,
  phase,
  artifactPhase,
  system,
  prompt,
  maxTokens,
  signal,
  tools = [],
  timeoutMs = DEFAULT_STEP_TIMEOUT_MS,
  returnFullResult = false,
}) {
  send(createEvent('agent.started', { agentId, phase, message: prompt.slice(0, 180) }));
  if (!budget.assertCanCall(model, prompt, maxTokens, phase, tools)) return null;

  const result = await callClaude({
    apiKey,
    model,
    system,
    prompt,
    maxTokens,
    signal,
    tools,
    timeoutMs,
    phase,
  });
  budget.record(result.costUsd);
  send(createEvent('artifact.created', {
    agentId,
    phase: artifactPhase,
    artifact: result.text,
    usage: result.usage,
    sources: result.sources,
    estimatedCostUsd: Number(result.costUsd.toFixed(6)),
    runCostUsd: Number(budget.spentUsd.toFixed(6)),
  }));
  if (artifactKey) {
    recorder.recordArtifact(artifactKey, {
      agentId,
      phase: artifactPhase,
      model,
      text: result.text,
      usage: result.usage,
      sources: result.sources,
      estimatedCostUsd: Number(result.costUsd.toFixed(6)),
      runCostUsd: Number(budget.spentUsd.toFixed(6)),
    });
  }
  await sleep(450);
  return returnFullResult ? result : result.text;
}

function promptForScoper(task) {
  return `Task: ${task}

Act as the Purification / Research Scoper role. Produce:
1. a crisp research question
2. scope boundaries
3. source-quality criteria
4. 2-3 unknowns or risks
Keep it concise and decision-useful.`;
}

function promptForStrategist(task, brief) {
  return `Task: ${task}

Research brief:
${brief}

Act as the Illumination / Research Strategist role. Design exactly three research lanes. For each lane, provide:
- lane name
- objective
- what evidence would change the answer
- what the lane should ignore
Keep it concise.`;
}

function promptForLane(task, brief, strategy, laneName) {
  return `Task: ${task}

Brief:
${brief}

Strategy:
${strategy}

Research lane: ${laneName}

Produce a compact lane note with architectural claims, caveats, and what should be cited or checked in a production workflow.

Do not name papers, authors, labs, benchmark years, exact percentages, or URLs. This lane has no retrieval access. If a claim needs evidence, mark it as "needs evidence" instead of supplying a source-like detail.`;
}

function promptForFocusedRetrieval(task, focus) {
  return `Task:
${task}

Evidence focus:
${focus}

Use exactly one web search. Keep the search narrow. Return:
1. 1-2 sourced findings with inline citations
2. what the source does and does not prove for the user's topology decision
3. one citation risk or caveat

Do not invent citations, paper titles, percentages, or source names. If the source is weak or indirect, say so.`;
}

function promptForSynthesis(task, brief, strategy, lanes) {
  return `Task: ${task}

Brief:
${brief}

Strategy:
${strategy}

Lane notes:
${lanes.map((lane, index) => `Lane ${index + 1}:\n${lane}`).join('\n\n')}

Act as the Perfection / Research Synthesizer role. Produce:
1. final answer
2. when this multi-agent topology is useful
3. risks/failure modes
4. what citations or external checks are still needed

Evidence discipline:
- Treat only the Evidence Lane Findings source index as retrieved evidence.
- Cite retrieved evidence with bracketed source IDs, such as [E1].
- Do not cite or repeat named studies, exact percentages, author names, or organization-specific claims unless they appear in the Evidence Lane Findings with a source ID.
- Treat Architecture and Risk lane numeric thresholds as hypotheses unless corroborated by Evidence.
Keep it concise but complete.`;
}

function promptForCitationCheck(synthesis, lanes = []) {
  return `Review this synthesis for citation risk:

${synthesis}

Evidence lane context:
${lanes.find((lane) => lane.includes('# Evidence Lane Findings')) || 'No Evidence Lane Findings artifact available.'}

Return a short citation/readiness check:
- claims that need external support
- claims that are safe as architectural judgment
- claims that cite a source ID but are not supported by that source index
- suggested next verification step`;
}

function dedupeSources(sources) {
  const byUrl = new Map();
  for (const source of sources) {
    if (!source?.url || byUrl.has(source.url)) continue;
    byUrl.set(source.url, source);
  }
  return [...byUrl.values()];
}

function formatSourceIndex(sources, prefix = 'E') {
  if (sources.length === 0) return 'No sources captured.';
  return sources
    .map((source, index) => {
      const id = `${prefix}${index + 1}`;
      const title = source.title || source.url;
      const citedText = source.citedText ? `\n  - cited text: ${source.citedText}` : '';
      const pageAge = source.pageAge ? `\n  - page age: ${source.pageAge}` : '';
      return `- [${id}] ${title}\n  - url: ${source.url}${pageAge}${citedText}`;
    })
    .join('\n');
}

function evidenceSearchFocuses(task, maxSearches) {
  const baseFocuses = [
    `Find recent source-grounded evidence comparing multi-agent LLM workflows with single-agent or single-model workflows for complex research, strategy, analysis, or knowledge-work tasks. User task: ${task}`,
    `Find source-grounded evidence about coordination overhead, latency, cost, or failure modes in LLM multi-agent systems such as lead/subagent, AutoGen, LangGraph, or similar research-agent architectures. User task: ${task}`,
    `Find source-grounded evidence about role specialization, agent heterogeneity, or critique/synthesis roles improving or failing in ambiguous LLM workflows. User task: ${task}`,
  ];
  return baseFocuses.slice(0, Math.max(1, Math.min(baseFocuses.length, maxSearches)));
}

async function runEvidenceLane({
  budget,
  send,
  apiKey,
  retrievalModel,
  recorder,
  system,
  task,
  signal,
  stepTimeoutMs,
  evidenceSearches,
}) {
  const notes = [];
  const failures = [];
  const allSources = [];
  const focuses = evidenceSearchFocuses(task, evidenceSearches);
  const perSearchTimeoutMs = Math.min(stepTimeoutMs, 90_000);

  for (const [index, focus] of focuses.entries()) {
    try {
      const result = await runStep({
        budget,
        send,
        apiKey,
        model: retrievalModel,
        agentId: 'illumination',
        recorder,
        artifactKey: null,
        phase: `Searching evidence ${index + 1}/${focuses.length}`,
        artifactPhase: `Evidence source note ${index + 1}`,
        system,
        prompt: promptForFocusedRetrieval(task, focus),
        maxTokens: 500,
        signal,
        tools: webSearchTools(1),
        timeoutMs: perSearchTimeoutMs,
        returnFullResult: true,
      });

      if (result?.text) {
        const searchSources = dedupeSources(result.sources ?? []);
        notes.push([
          `## Evidence search ${index + 1}`,
          '',
          result.text,
          '',
          `### Sources for evidence search ${index + 1}`,
          '',
          formatSourceIndex(searchSources, `E${index + 1}.`),
        ].join('\n'));
        allSources.push(...searchSources);
      }
    } catch (error) {
      const message = `Evidence search ${index + 1} failed: ${error.message || 'Unknown retrieval error.'}`;
      failures.push(message);
      send(laneWarning('Evidence search degraded', message));
    }
  }

  if (notes.length === 0) {
    const message = failures.join('\n') || 'No focused evidence searches returned usable notes.';
    return recordSyntheticArtifact({
      send,
      recorder,
      artifactKey: 'lanes',
      agentId: 'illumination',
      phase: 'Evidence lane findings unavailable',
      model: retrievalModel,
      artifact: [
        '# Evidence Lane Unavailable',
        '',
        message,
        '',
        'No external sources were retrieved for this run. Treat any downstream empirical claims as unverified architectural judgment.',
        '',
        'Perfection should preserve this limitation, avoid citing unsupported claims, and recommend a follow-up retrieval run before publication.',
      ].join('\n'),
      budget,
    });
  }

  const artifact = [
    '# Evidence Lane Findings',
    '',
    notes.join('\n\n---\n\n'),
    '',
    '## Combined Source Index',
    '',
    formatSourceIndex(dedupeSources(allSources)),
    failures.length > 0
      ? `\n\n## Retrieval caveats\n\n${failures.map((failure) => `- ${failure}`).join('\n')}`
      : '',
    '',
    '## Synthesis instruction',
    '',
    'Perfection may cite only the sourced findings above as retrieved evidence. Use bracketed source IDs from the Combined Source Index, such as [E1]. Any numeric thresholds not present here must remain hypotheses or architectural judgment.',
  ].join('\n');

  return recordSyntheticArtifact({
    send,
    recorder,
    artifactKey: 'lanes',
    agentId: 'illumination',
    phase: 'Evidence lane findings',
    model: retrievalModel,
    artifact,
    sources: dedupeSources(allSources),
    budget,
    synthetic: false,
  });
}

async function runResearchWorkflow({ req, res }) {
  const stream = createSse(res);
  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const scoutModel = process.env.AGENTIC_RESEARCH_SCOUT_MODEL || DEFAULT_SCOUT_MODEL;
  const synthesisModel = process.env.AGENTIC_RESEARCH_SYNTHESIS_MODEL || DEFAULT_SYNTHESIS_MODEL;
  const retrievalModel = process.env.AGENTIC_RESEARCH_RETRIEVAL_MODEL || DEFAULT_RETRIEVAL_MODEL;
  const stepTimeoutMs = Number(process.env.AGENTIC_RESEARCH_STEP_TIMEOUT_MS || DEFAULT_STEP_TIMEOUT_MS);
  const evidenceSearches = Number(
    process.env.AGENTIC_RESEARCH_EVIDENCE_SEARCHES
      || process.env.AGENTIC_RESEARCH_WEB_SEARCH_MAX_USES
      || DEFAULT_EVIDENCE_SEARCHES,
  );
  const runBudgetUsd = Number(process.env.AGENTIC_RESEARCH_RUN_BUDGET_USD || '1');
  const projectBudgetUsd = Number(process.env.AGENTIC_RESEARCH_PROJECT_BUDGET_USD || '80');
  const url = new URL(req.url, 'http://localhost');
  const task = url.searchParams.get('task') || DEFAULT_TASK;

  let saved = false;
  let runStatus = 'not-started';
  let budget = null;
  const recorder = createRunRecorder({
    task,
    scoutModel,
    synthesisModel,
    retrievalModel,
    runBudgetUsd,
    projectBudgetUsd,
  });

  const send = (event) => {
    recorder.recordEvent(event);
    stream.send(event);
  };

  try {
    if (!apiKey) {
      send(runtimeError('Missing Anthropic API key', 'Set ANTHROPIC_API_KEY before running the real workflow.'));
      return;
    }

    const ledger = await readLedger();
    if ((ledger.totalUsd ?? 0) >= projectBudgetUsd) {
      send(runtimeError(
        'Project budget reached',
        `The local ledger is already at $${(ledger.totalUsd ?? 0).toFixed(2)} of the $${projectBudgetUsd.toFixed(2)} project cap.`,
      ));
      return;
    }

    budget = createBudgetGuard({
      runBudgetUsd,
      projectBudgetUsd,
      priorSpendUsd: ledger.totalUsd ?? 0,
      send,
    });

    send(createEvent('workflow.started', {
      phase: 'Real research workflow started',
      message: `Budget guard: $${budget.effectiveRunBudgetUsd.toFixed(2)} max this run; $${projectBudgetUsd.toFixed(2)} project cap.`,
    }));
    runStatus = 'running';

    const system = 'You are a careful research subagent in a visible multi-agent topology. Be concise, mark uncertainty, and do not invent citations.';

    const brief = await runStep({
      budget,
      send,
      apiKey,
      model: scoutModel,
      agentId: 'purification',
      recorder,
      artifactKey: 'brief',
      phase: 'Scoping real research task',
      artifactPhase: 'Research brief created',
      system,
      prompt: promptForScoper(task),
      maxTokens: 700,
      signal: abortController.signal,
      timeoutMs: stepTimeoutMs,
    });
    if (!brief) return;

    send(createEvent('signal.transferred', {
      from: 'purification',
      to: 'illumination',
      phase: 'Brief handed off',
      message: 'Purified research brief sent upward for lane strategy.',
    }));
    await sleep(900);

    const strategy = await runStep({
      budget,
      send,
      apiKey,
      model: scoutModel,
      agentId: 'illumination',
      recorder,
      artifactKey: 'strategy',
      phase: 'Planning research lanes',
      artifactPhase: 'Research lanes planned',
      system,
      prompt: promptForStrategist(task, brief),
      maxTokens: 900,
      signal: abortController.signal,
      timeoutMs: stepTimeoutMs,
    });
    if (!strategy) return;

    const laneNames = ['Architecture lane', 'Evidence lane', 'Risk lane'];
    const lanes = [];
    for (const laneName of laneNames) {
      const isRetrievalLane = laneName === 'Evidence lane';
      if (isRetrievalLane) {
        const lane = await runEvidenceLane({
          budget,
          send,
          apiKey,
          retrievalModel,
          recorder,
          system,
          task,
          signal: abortController.signal,
          stepTimeoutMs,
          evidenceSearches,
        });
        if (!lane) return;
        lanes.push(lane);
        continue;
      }

      let lane;
      try {
        lane = await runStep({
          budget,
          send,
          apiKey,
          model: scoutModel,
          agentId: 'illumination',
          recorder,
          artifactKey: 'lanes',
          phase: `Running ${laneName.toLowerCase()}`,
          artifactPhase: `${laneName} findings`,
          system,
          prompt: promptForLane(task, brief, strategy, laneName),
          maxTokens: 700,
          signal: abortController.signal,
          timeoutMs: stepTimeoutMs,
        });
      } catch (error) {
        throw error;
      }
      if (!lane) return;
      lanes.push(lane);
    }

    send(createEvent('signal.transferred', {
      from: 'illumination',
      to: 'perfection',
      phase: 'Findings handed off',
      message: 'Condensed lane findings sent upward for synthesis.',
    }));
    await sleep(900);

    const synthesis = await runStep({
      budget,
      send,
      apiKey,
      model: synthesisModel,
      agentId: 'perfection',
      recorder,
      artifactKey: 'synthesis',
      phase: 'Synthesizing final answer',
      artifactPhase: 'Research answer drafted',
      system,
      prompt: promptForSynthesis(task, brief, strategy, lanes),
      maxTokens: 1200,
      signal: abortController.signal,
      timeoutMs: stepTimeoutMs,
    });
    if (!synthesis) return;

    const citationCheck = await runStep({
      budget,
      send,
      apiKey,
      model: scoutModel,
      agentId: 'perfection',
      recorder,
      artifactKey: 'citationCheck',
      phase: 'Checking citation readiness',
      artifactPhase: 'Citation readiness checked',
      system,
      prompt: promptForCitationCheck(synthesis, lanes),
      maxTokens: 600,
      signal: abortController.signal,
      timeoutMs: stepTimeoutMs,
    });
    if (!citationCheck) return;

    send(createEvent('workflow.completed', {
      agentId: 'perfection',
      phase: 'Real research complete',
      message: `Run complete. Estimated model cost: $${budget.spentUsd.toFixed(4)}.`,
    }));
    runStatus = 'completed';

    await appendLedgerRun({
      at: new Date().toISOString(),
      runId: recorder.id,
      task,
      costUsd: Number(budget.spentUsd.toFixed(6)),
      scoutModel,
      retrievalModel,
      synthesisModel,
    });
    saved = true;
  } catch (error) {
    if (!abortController.signal.aborted) {
      runStatus = 'failed';
      send(runtimeError('Real workflow failed', error.message || 'Unknown workflow error.'));
    }
  } finally {
    if (runStatus === 'running') {
      runStatus = 'incomplete';
    }
    recorder.finish(runStatus, budget?.spentUsd ?? 0);
    if (recorder.events.length > 0 || budget?.spentUsd > 0) {
      await writeRunArtifact(recorder).catch(() => {});
    }

    if (budget && budget.spentUsd > 0 && !saved) {
      await appendLedgerRun({
        at: new Date().toISOString(),
        runId: recorder.id,
        task,
        costUsd: Number(budget.spentUsd.toFixed(6)),
        scoutModel,
        retrievalModel,
        synthesisModel,
        incomplete: true,
      }).catch(() => {});
    }
    stream.close();
  }
}

export function agenticResearchWorkflowPlugin() {
  return {
    name: 'agentic-research-workflow',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (req.method !== 'GET' || url.pathname !== ENDPOINT) {
          next();
          return;
        }

        runResearchWorkflow({ req, res });
      });
    },
  };
}
