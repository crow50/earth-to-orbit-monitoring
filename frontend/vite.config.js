import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: Keep base-path configurable so we can serve the app under /e2o/ when
// running behind the IDX gateway, without breaking local dev.
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://api:8000',
    },
  },
});
