import { events, EventType } from './events/agenticEvents.js';

const demoTask =
  'Research how multi-agent systems improve complex web research, using Anthropic-style lead/subagent architecture as the reference problem space.';

const PRESENTATION_SPEED = 1.15;
const EVENT_DWELL_MS = 2400;

// Each entry is a typed event merged with a scheduling offset (ms).
// When wiring a real agentic runtime, replace this script with a live
// event emitter that produces the same event shapes.
const demoScript = [
  { at:   600, ...events.workflowStarted('Research request received', demoTask) },

  { at:  2800, ...events.agentStarted('purification', 'Scoping research',
      'Clarify the research question, effort budget, success criteria, and source-quality rules.') },
  { at:  5400, ...events.artifactCreated('purification', 'Research brief purified',
      'Brief: explain when multi-agent research helps; cover decomposition, parallel search, source quality, citations, and failure modes.') },
  { at:  7600, ...events.signalTransferred('purification', 'illumination', 'Brief handed off',
      'Clean research brief sent to the Illuminator for strategy and lane design.') },

  { at:  9800, ...events.agentStarted('illumination', 'Planning parallel lanes',
      'Design research lanes: architecture, delegation prompts, source evaluation, and production risks.') },
  { at: 12400, ...events.artifactCreated('illumination', 'Lane A findings',
      'Architecture lane: lead researcher decomposes the query, spawns specialized subagents, then gathers condensed findings.') },
  { at: 15000, ...events.artifactCreated('illumination', 'Lane B findings',
      'Search lane: subagents use broad-to-narrow search, evaluate intermediate results, and adapt when sources are weak.') },
  { at: 17600, ...events.artifactCreated('illumination', 'Lane C findings',
      'Reliability lane: research quality depends on citations, source quality, observability, and avoiding duplicated subagent work.') },
  { at: 20200, ...events.signalTransferred('illumination', 'perfection', 'Findings handed off',
      'Condensed lane findings sent upward for synthesis and citation-quality judgment.') },

  { at: 22800, ...events.agentStarted('perfection', 'Synthesizing report',
      'Integrate findings, check coverage against the brief, and resolve duplicated or weak claims.') },
  { at: 25800, ...events.artifactCreated('perfection', 'Citation pass',
      'Citation agent pass: every important claim needs a supporting source location; weak or uncited claims are softened.') },
  { at: 28600, ...events.artifactCreated('perfection', 'Research answer drafted',
      'Answer: multi-agent research helps breadth-first questions where many independent search directions can be compressed into one synthesis.') },
  { at: 31400, ...events.workflowCompleted('perfection', 'Research complete',
      'Final report ready: architecture summary, when-to-use guidance, failure modes, and citation-backed claims.') },
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
