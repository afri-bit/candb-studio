import { defineConfig } from '@vscode/test-cli';

// Optional: set VSCODE_TEST_FILES to a glob (e.g. out/test/integration/**/*.test.js) for integration-only runs.
const files = process.env.VSCODE_TEST_FILES ?? 'out/test/**/*.test.js';

const ci = process.env.CI === 'true';

/**
 * CI (GitHub Actions): lighter VS Code startup and generous download / mocha timeouts.
 * Unit tests use Mocha directly and do not load this file.
 */
export default defineConfig({
  files,
  ...(ci && {
    launchArgs: [
      '--disable-extensions',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
    mocha: {
      timeout: 120_000,
    },
    download: {
      timeout: 600_000,
    },
  }),
});
