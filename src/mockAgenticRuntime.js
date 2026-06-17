import { events, EventType } from './events/agenticEvents.js';

const demoTask =
  'Research how multi-agent systems improve complex web research, using Anthropic-style lead/subagent architecture as the reference problem space.';

const PRESENTATION_SPEED = 1.25;
const EVENT_DWELL_MS = 3600;

// Each entry is a typed event merged with a scheduling offset (ms).
// When wiring a real agentic runtime, replace this script with a live
// event emitter that produces the same event shapes.
const demoScript = [
  { at:   600, ...events.workflowStarted('Research request received', demoTask) },

  { at:  2800, ...events.agentStarted('purification', 'Clarifying the research question',
      'Clarify the research question, effort budget, success criteria, and source-quality rules.') },
  { at:  5400, ...events.artifactCreated('purification', 'Clarified research brief ready',
      'Brief: explain when multi-agent research helps; cover decomposition, parallel search, source quality, citations, and failure modes.') },
  { at:  7600, ...events.signalTransferred('purification', 'illumination', 'Question clarified for research planning',
      'The Purifier turns the raw question into a clearer research brief and passes it to the Illuminator.') },

  { at:  9800, ...events.agentStarted('illumination', 'Planning parallel lanes',
      'Design research lanes: architecture, delegation prompts, source evaluation, and production risks.') },
  { at: 12400, ...events.artifactCreated('illumination', 'Lane A findings',
      'Architecture lane: lead researcher decomposes the query, spawns specialized subagents, then gathers condensed findings.') },
  { at: 15000, ...events.artifactCreated('illumination', 'Lane B findings',
      'Search lane: subagents use broad-to-narrow search, evaluate intermediate results, and adapt when sources are weak.') },
  { at: 17600, ...events.artifactCreated('illumination', 'Lane C findings',
      'Reliability lane: research quality depends on citations, source quality, observability, and avoiding duplicated subagent work.') },
  { at: 20200, ...events.signalTransferred('illumination', 'perfection', 'Findings ready for final synthesis',
      'The Illuminator gives the source-graded findings to the Perfector for judgment and synthesis.') },

  { at: 22800, ...events.agentStarted('perfection', 'Writing the final answer',
      'Integrate findings, check coverage against the brief, and resolve duplicated or weak claims.') },
  { at: 25800, ...events.artifactCreated('perfection', 'Checking source strength',
      'Citation agent pass: every important claim needs a supporting source location; weak or uncited claims are softened.') },
  { at: 28600, ...events.artifactCreated('perfection', 'Research answer drafted',
      'Answer: multi-agent research helps breadth-first questions where many independent search directions can be compressed into one synthesis.') },
  { at: 31400, ...events.workflowCompleted('perfection', 'Research workflow complete',
      'Final report ready: architecture summary, when-to-use guidance, failure modes, and citation-backed claims.',
      { citationRisk: 'low', publicationReady: true }) },
];

export class MockAgenticRuntime {
  constructor(script = demoScript, options = {}) {
    this.script = script;
    this.speed = options.speed ?? PRESENTATION_SPEED;
    this.listeners = new Set();
    this.timers = [];
    this.isRunning = false;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSpeed(speed) {
    this.speed = Math.max(0.25, speed);
  }

  setTask() {
    // Mock events are scripted; keep adapter parity with real runtimes.
  }

  start() {
    this.stop();
    this.isRunning = true;
    this.emit(events.runtimeReady('Press Run Mock to replay the event contract.'));

    for (const entry of this.script) {
      const { at, ...event } = entry;
      const timer = window.setTimeout(() => {
        if (this.isRunning) this.emit(event);
      }, at * this.speed);
      this.timers.push(timer);
    }
  }

  stop() {
    this.isRunning = false;
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }

  reset() {
    this.stop();
    this.emit(events.workflowReset());
  }

  emit(event) {
    const enriched = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      source: 'mock-agentic-runtime',
      dwellMs: EVENT_DWELL_MS * this.speed,
      speed: this.speed,
      ...event,
    };
    for (const listener of this.listeners) listener(enriched);
  }
}

export function createMockAgenticRuntime(options = {}) {
  return new MockAgenticRuntime(demoScript, options);
}
