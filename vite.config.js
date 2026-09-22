import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Everything under /api is forwarded to the Express proxy,
      // which is the only process that ever sees MISTRAL_API_KEY.
      '/api': { target: 'http://localhost:8787', changeOrigin: true }
    }
  },
  build: { outDir: 'dist' }
});
