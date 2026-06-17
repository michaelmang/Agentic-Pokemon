import { events, EventType } from '../events/agenticEvents.js';

const DEFAULT_RESEARCH_TASK =
  'Run a small multi-agent research workflow and stream topology events for scoping, lane planning, synthesis, and final answer.';

export class RealAgenticRuntime {
  constructor(options = {}) {
    this.endpoint = options.endpoint;
    this.task = options.task ?? DEFAULT_RESEARCH_TASK;
    this.listeners = new Set();
    this.source = null;
    this.isRunning = false;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSpeed() {
    // Real runtimes control their own pacing. Keep this method for adapter parity.
  }

  setTask(task) {
    const trimmed = String(task || '').trim();
    this.task = trimmed || DEFAULT_RESEARCH_TASK;
  }

  start() {
    this.stop();

    if (!this.endpoint) {
      this.emit({
        type: EventType.RUNTIME_ERROR,
        phase: 'Real runtime unavailable',
        message: 'No real runtime endpoint configured.',
      });
      return;
    }

    this.isRunning = true;
    this.emit(events.runtimeReady(`Connecting to real research workflow at ${this.endpoint}.`));

    const url = new URL(this.endpoint, window.location.origin);
    url.searchParams.set('task', this.task);
    this.source = new EventSource(url);

    this.source.onmessage = (message) => {
      this.handleMessage(message);
    };

    this.source.addEventListener('agentic-event', (message) => {
      this.handleMessage(message);
    });

    this.source.onerror = () => {
      if (!this.isRunning) return;
      this.emit({
        type: EventType.RUNTIME_ERROR,
        phase: 'Real runtime disconnected',
        message: `Could not stream events from ${this.endpoint}.`,
      });
      this.stop();
    };
  }

  handleMessage(message) {
    if (!this.isRunning) return;
    try {
      const event = JSON.parse(message.data);
      this.emit(event);
      if (
        event.type === EventType.WORKFLOW_COMPLETED ||
        event.type === EventType.WORKFLOW_RESET ||
        event.type === EventType.RUNTIME_ERROR
      ) {
        this.stop();
      }
    } catch {
      this.emit({
        type: EventType.RUNTIME_ERROR,
        phase: 'Malformed runtime event',
        message: 'The real workflow emitted an event that was not valid JSON.',
      });
      this.stop();
    }
  }

  stop() {
    this.isRunning = false;
    this.source?.close();
    this.source = null;
  }

  reset() {
    this.stop();
    this.emit(events.workflowReset());
  }

  emit(event) {
    const enriched = {
      id: event.id ?? crypto.randomUUID(),
      timestamp: event.timestamp ?? Date.now(),
      source: event.source ?? 'real-agentic-runtime',
      dwellMs: event.dwellMs ?? 2400,
      speed: event.speed ?? 1,
      ...event,
    };

    for (const listener of this.listeners) listener(enriched);
  }
}

export function createRealAgenticRuntime(options = {}) {
  return new RealAgenticRuntime(options);
}
