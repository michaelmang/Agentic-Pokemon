// Canonical event type identifiers — the shared vocabulary between the
// agentic runtime and the visual layer.
export const EventType = Object.freeze({
  RUNTIME_READY:      'runtime.ready',
  RUNTIME_ERROR:      'runtime.error',
  WORKFLOW_STARTED:   'workflow.started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_RESET:     'workflow.reset',
  AGENT_STARTED:      'agent.started',
  ARTIFACT_CREATED:   'artifact.created',
  SIGNAL_TRANSFERRED: 'signal.transferred',
  LANE_WARNING:        'lane.warning',
});

// Event factories — enforce shape at the call site so every event is
// structurally consistent before the runtime enriches it with metadata.
export const events = {
  runtimeReady: (message) =>
    ({ type: EventType.RUNTIME_READY, phase: 'Ready', message }),

  workflowStarted: (phase, message) =>
    ({ type: EventType.WORKFLOW_STARTED, phase, message }),

  workflowCompleted: (agentId, phase, message, meta = {}) =>
    ({ type: EventType.WORKFLOW_COMPLETED, agentId, phase, message, ...meta }),

  workflowReset: () =>
    ({ type: EventType.WORKFLOW_RESET, phase: 'Reset', message: 'Event stream reset.' }),

  agentStarted: (agentId, phase, message) =>
    ({ type: EventType.AGENT_STARTED, agentId, phase, message }),

  artifactCreated: (agentId, phase, artifact) =>
    ({ type: EventType.ARTIFACT_CREATED, agentId, phase, artifact }),

  signalTransferred: (from, to, phase, message) =>
    ({ type: EventType.SIGNAL_TRANSFERRED, from, to, phase, message }),
};
