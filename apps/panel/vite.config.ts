import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@monaworld/domain': root + 'packages/domain/src/index.ts',
      '@monaworld/contracts': root + 'packages/contracts/src/index.ts',
    },
  },
  build: {
    // El panel es la raíz del sitio; el overlay se construye después en /overlay.
    outDir: root + 'public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/room': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
