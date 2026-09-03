import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/overlay/',
  resolve: {
    alias: {
      '@monaworld/domain': root + 'packages/domain/src/index.ts',
      '@monaworld/contracts': root + 'packages/contracts/src/index.ts',
    },
  },
  build: {
    // Se construye DESPUÉS del panel, dentro de su salida. No vacía el destino.
    outDir: root + 'public/overlay',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: { '/room': { target: 'ws://127.0.0.1:8787', ws: true } },
  },
});
