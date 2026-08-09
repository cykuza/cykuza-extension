import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    // Tests run without release secrets; empty = custom-only defaults.
    'import.meta.env.CYKUZA_ELECTRUM_MAINNET_URLS': JSON.stringify(''),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
