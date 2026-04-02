import { defineConfig } from '@vscode/test-cli';

// Optional: set VSCODE_TEST_FILES to a glob (e.g. out/test/integration/**/*.test.js) for integration-only runs.
const files = process.env.VSCODE_TEST_FILES ?? 'out/test/**/*.test.js';

export default defineConfig({
  files,
});
