import { create } from 'zustand';
import { EventType } from '../events/agenticEvents.js';
import { runtimeConfig } from '../runtimes/runtimeConfig.js';

const MAX_LOG = 24;
const DEFAULT_RESEARCH_TASK =
  'Research when a small multi-agent workflow is useful for complex research tasks, using a lead/subagent architecture as the reference pattern.';

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

function formatLogEvent(event) {
  const label = LOG_LABEL[event.type] ?? event.type;
  const detail = event.artifact || event.message || event.phase || '';
  return `${label}: ${detail}`;
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
    const status = `${event.phase || event.type}: ${event.message || event.artifact || ''}`;
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
