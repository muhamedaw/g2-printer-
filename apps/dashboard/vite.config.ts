import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mpg2/shared': path.resolve(__dirname, '../../core/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api':    { target: 'http://localhost:3001', changeOrigin: true },
      '/ws':     { target: 'ws://localhost:3001',  ws: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
