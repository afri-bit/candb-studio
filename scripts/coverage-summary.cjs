/**
 * Append a markdown coverage table to GITHUB_STEP_SUMMARY (GitHub Actions).
 * Run from repo root after `npm run test:coverage`.
 */
const fs = require('fs');

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const coveragePath = 'coverage/coverage-summary.json';

if (!summaryPath) {
  console.log('GITHUB_STEP_SUMMARY not set; skipping.');
  process.exit(0);
}

if (!fs.existsSync(coveragePath)) {
  console.log('No coverage/coverage-summary.json; skipping summary table.');
  process.exit(0);
}

const s = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
const t = s.total;
const fmt = (x) => (x && typeof x.pct === 'number' ? x.pct.toFixed(2) : '—');

const lines = [
  '## Coverage (`out/src`)',
  '',
  '| Metric | Coverage |',
  '|--------|----------|',
  `| Lines | ${fmt(t.lines)}% |`,
  `| Statements | ${fmt(t.statements)}% |`,
  `| Functions | ${fmt(t.functions)}% |`,
  `| Branches | ${fmt(t.branches)}% |`,
  '',
  'Unit tests run under Node (c8 + mocha) with a minimal `vscode` shim. Integration tests run in the next step.',
  '',
];

fs.appendFileSync(summaryPath, lines.join('\n'));
