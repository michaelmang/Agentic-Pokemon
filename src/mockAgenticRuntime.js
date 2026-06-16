const demoTask =
  'Research how multi-agent systems improve complex web research, using Anthropic-style lead/subagent architecture as the reference problem space.';

const PRESENTATION_SPEED = 1.15;
const EVENT_DWELL_MS = 2400;

const demoEvents = [
  {
    at: 600,
    type: 'workflow.started',
    phase: 'Research request received',
    message: demoTask,
  },
  {
    at: 2800,
    type: 'agent.started',
    agentId: 'purification',
    phase: 'Scoping research',
    message: 'Clarify the research question, effort budget, success criteria, and source-quality rules.',
  },
  {
    at: 5400,
    type: 'artifact.created',
    agentId: 'purification',
    phase: 'Research brief purified',
    artifact:
      'Brief: explain when multi-agent research helps; cover decomposition, parallel search, source quality, citations, and failure modes.',
  },
  {
    at: 7600,
    type: 'signal.transferred',
    from: 'purification',
    to: 'illumination',
    phase: 'Brief handed off',
    message: 'Clean research brief sent to the Illuminator for strategy and lane design.',
  },
  {
    at: 9800,
    type: 'agent.started',
    agentId: 'illumination',
    phase: 'Planning parallel lanes',
    message: 'Design research lanes: architecture, delegation prompts, source evaluation, and production risks.',
  },
  {
    at: 12400,
    type: 'artifact.created',
    agentId: 'illumination',
    phase: 'Lane A findings',
    artifact:
      'Architecture lane: lead researcher decomposes the query, spawns specialized subagents, then gathers condensed findings.',
  },
  {
    at: 15000,
    type: 'artifact.created',
    agentId: 'illumination',
    phase: 'Lane B findings',
    artifact:
      'Search lane: subagents use broad-to-narrow search, evaluate intermediate results, and adapt when sources are weak.',
  },
  {
    at: 17600,
    type: 'artifact.created',
    agentId: 'illumination',
    phase: 'Lane C findings',
    artifact:
      'Reliability lane: research quality depends on citations, source quality, observability, and avoiding duplicated subagent work.',
  },
  {
    at: 20200,
    type: 'signal.transferred',
    from: 'illumination',
    to: 'perfection',
    phase: 'Findings handed off',
    message: 'Condensed lane findings sent upward for synthesis and citation-quality judgment.',
  },
  {
    at: 22800,
    type: 'agent.started',
    agentId: 'perfection',
    phase: 'Synthesizing report',
    message: 'Integrate findings, check coverage against the brief, and resolve duplicated or weak claims.',
  },
  {
    at: 25800,
    type: 'artifact.created',
    agentId: 'perfection',
    phase: 'Citation pass',
    artifact:
      'Citation agent pass: every important claim needs a supporting source location; weak or uncited claims are softened.',
  },
  {
    at: 28600,
    type: 'artifact.created',
    agentId: 'perfection',
    phase: 'Research answer drafted',
    artifact:
      'Answer: multi-agent research helps breadth-first questions where many independent search directions can be compressed into one synthesis.',
  },
  {
    at: 31400,
    type: 'workflow.completed',
    agentId: 'perfection',
    phase: 'Research complete',
    message:
      'Final report ready: architecture summary, when-to-use guidance, failure modes, and citation-backed claims.',
  },
];

export class MockAgenticRuntime {
  constructor(events = demoEvents, options = {}) {
    this.events = events;
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
    this.emit({
      type: 'runtime.ready',
      phase: 'Mock ready',
      message: 'Press Run Mock to replay the event contract.',
    });

    for (const event of this.events) {
      const timer = window.setTimeout(() => {
        if (!this.isRunning) return;
        this.emit(event);
      }, event.at * this.speed);
      this.timers.push(timer);
    }
  }

  stop() {
    this.isRunning = false;
    for (const timer of this.timers) {
      window.clearTimeout(timer);
    }
    this.timers = [];
  }

  reset() {
    this.stop();
    this.emit({
      type: 'workflow.reset',
      phase: 'Reset',
      message: 'Mock event stream reset.',
    });
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

    for (const listener of this.listeners) {
      listener(enriched);
    }
  }
}

export function createMockAgenticRuntime(options = {}) {
  return new MockAgenticRuntime(demoEvents, options);
}
