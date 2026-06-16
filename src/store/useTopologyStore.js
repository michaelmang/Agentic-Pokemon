import { create } from 'zustand';
import { EventType } from '../events/agenticEvents.js';

const MAX_LOG = 24;

const LOG_LABEL = {
  [EventType.RUNTIME_READY]:      'ready',
  [EventType.WORKFLOW_STARTED]:   'wf.started',
  [EventType.WORKFLOW_COMPLETED]: 'wf.done',
  [EventType.WORKFLOW_RESET]:     'wf.reset',
  [EventType.AGENT_STARTED]:      'ag.started',
  [EventType.ARTIFACT_CREATED]:   'art.created',
  [EventType.SIGNAL_TRANSFERRED]: 'sig.tx',
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

  dispatchCommand: (command) =>
    set(() => ({
      command,
      ...(command.type === 'start'       && { eventLog: [], status: 'Starting...' }),
      ...(command.type === 'reset'       && { eventLog: [], status: 'Ready.' }),
      ...(command.type === 'setLocation' && { location: command.id }),
    })),

  clearCommand: () => set({ command: null }),
}));
