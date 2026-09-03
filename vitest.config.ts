import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@monaworld/domain': root + 'packages/domain/src/index.ts',
      '@monaworld/contracts': root + 'packages/contracts/src/index.ts',
      '@monaworld/connectors': root + 'packages/connectors/src/index.ts',
      '@monaworld/application': root + 'packages/application/src/index.ts',
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/agent/**/*.test.ts'],
  },
});
