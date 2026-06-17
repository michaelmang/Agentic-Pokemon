export const RuntimeMode = Object.freeze({
  MOCK: 'mock',
  REAL: 'real',
});

export const runtimeConfig = {
  defaultMode: import.meta.env.VITE_AGENTIC_RUNTIME === RuntimeMode.REAL
    ? RuntimeMode.REAL
    : RuntimeMode.MOCK,
  realEndpoint: import.meta.env.VITE_AGENTIC_REAL_ENDPOINT || '/api/agentic/research/events',
};
