import { create } from 'zustand';

const MAX_LOG = 24;

function formatLogEvent(event) {
  const detail = event.artifact || event.message || event.phase || '';
  const compactType = event.type
    .replace('workflow.', 'wf.')
    .replace('agent.', 'ag.')
    .replace('artifact.', 'art.')
    .replace('signal.', 'sig.');
  return `${compactType}: ${detail}`;
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
      ...(command.type === 'start' && { eventLog: [], status: 'Starting...' }),
      ...(command.type === 'reset' && { eventLog: [], status: 'Ready.' }),
      ...(command.type === 'setLocation' && { location: command.id }),
    })),

  clearCommand: () => set({ command: null }),
}));
