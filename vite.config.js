import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { agenticResearchWorkflowPlugin } from './src/server/agenticResearchWorkflow.js';

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [react(), agenticResearchWorkflowPlugin()],
  };
});
