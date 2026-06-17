import { create } from 'zustand';
import { EventType } from '../events/agenticEvents.js';
import { runtimeConfig } from '../runtimes/runtimeConfig.js';

const MAX_LOG = 24;
const DEFAULT_RESEARCH_TASK =
  'When is a visible three-role agentic topology, using Purification, Illumination, and Perfection, preferable to a single-agent research workflow for ambiguous product strategy research? Compare quality, cost, latency, coordination overhead, and failure modes using recent multi-agent research and practitioner evidence.';

const LOG_LABEL = {
  [EventType.RUNTIME_READY]:      'ready',
  [EventType.RUNTIME_ERROR]:      'runtime.error',
  [EventType.WORKFLOW_STARTED]:   'wf.started',
  [EventType.WORKFLOW_COMPLETED]: 'wf.done',
  [EventType.WORKFLOW_RESET]:     'wf.reset',
  [EventType.AGENT_STARTED]:      'ag.started',
  [EventType.ARTIFACT_CREATED]:   'art.created',
  [EventType.SIGNAL_TRANSFERRED]: 'sig.tx',
  [EventType.LANE_WARNING]:       'lane.warn',
};

function costText(event) {
  return typeof event.runCostUsd === 'number' ? ` · $${event.runCostUsd.toFixed(4)}` : '';
}

function sourceText(event) {
  const count = Array.isArray(event.sources) ? event.sources.length : 0;
  return count > 0 ? ` · ${count} sources` : '';
}

function readinessText(event) {
  if (!event.citationRisk) return '';
  const ready = event.publicationReady ? 'publication-ready' : 'needs citation repair';
  return ` · citation risk: ${event.citationRisk} · ${ready}`;
}

function formatLogEvent(event) {
  const label = LOG_LABEL[event.type] ?? event.type;
  const detail = event.phase || event.message || '';
  return `${label}: ${detail}${costText(event)}${sourceText(event)}${readinessText(event)}`;
}

function formatStatus(event) {
  if (event.type === EventType.RUNTIME_READY) return event.message || 'Ready.';
  if (event.type === EventType.RUNTIME_ERROR) return `Error: ${event.phase || event.message || 'workflow stopped'}`;
  if (event.type === EventType.WORKFLOW_STARTED) return `${event.phase || 'Workflow started'}${costText(event)}`;
  if (event.type === EventType.WORKFLOW_COMPLETED) {
    return `${event.phase || 'Workflow complete'}${costText(event)}${readinessText(event)}`;
  }
  if (event.type === EventType.LANE_WARNING) return `Warning: ${event.phase || event.message}`;
  if (event.type === EventType.AGENT_STARTED) return `${event.phase || 'Agent working'}${costText(event)}`;
  if (event.type === EventType.ARTIFACT_CREATED) return `${event.phase || 'Artifact created'}${costText(event)}${sourceText(event)}`;
  if (event.type === EventType.SIGNAL_TRANSFERRED) return `${event.phase || 'Signal transferred'}: ${event.from} → ${event.to}`;
  return event.phase || event.type;
}

export const useTopologyStore = create((set) => ({
  status: 'Ready.',
  eventLog: [],
  logsOpen: false,
  location: 'cinnabar',
  runtimeMode: runtimeConfig.defaultMode,
  researchTask: DEFAULT_RESEARCH_TASK,
  command: null,

  applyEvent: (event) => {
    const status = formatStatus(event);
    const line = formatLogEvent(event);
    set((s) => ({
      status,
      eventLog: [line, ...s.eventLog].slice(0, MAX_LOG),
    }));
  },

  toggleLogs: () => set((s) => ({ logsOpen: !s.logsOpen })),

  setResearchTask: (researchTask) => set({ researchTask }),

  dispatchCommand: (command) =>
    set(() => ({
      command,
      ...(command.type === 'start'       && { eventLog: [], status: 'Starting...' }),
      ...(command.type === 'reset'       && { eventLog: [], status: 'Ready.' }),
      ...(command.type === 'setLocation' && { location: command.id }),
      ...(command.type === 'setRuntimeMode' && {
        runtimeMode: command.mode,
        eventLog: [],
        status: `Runtime: ${command.mode}.`,
      }),
    })),

  clearCommand: () => set({ command: null }),
}));
