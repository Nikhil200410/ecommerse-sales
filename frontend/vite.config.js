import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the browser talks to Vite (5173); /api is proxied to the Express backend,
// so no CORS setup is needed. Override the target with VITE_PROXY_TARGET if the API port differs.
const target = process.env.VITE_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target, changeOrigin: true } } },
  preview: { port: 5173, proxy: { '/api': { target, changeOrigin: true } } },
});
