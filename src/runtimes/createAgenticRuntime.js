import { createMockAgenticRuntime } from '../mockAgenticRuntime.js';
import { createRealAgenticRuntime } from './realAgenticRuntime.js';
import { RuntimeMode, runtimeConfig } from './runtimeConfig.js';

export function createAgenticRuntime(mode = runtimeConfig.defaultMode) {
  if (mode === RuntimeMode.REAL) {
    return createRealAgenticRuntime({
      endpoint: runtimeConfig.realEndpoint,
    });
  }

  return createMockAgenticRuntime();
}
