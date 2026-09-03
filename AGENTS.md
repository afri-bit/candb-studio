# CANdb Studio — agent guide

This file is for **Cursor, Cloud Agents, and other coding agents**. Humans: [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/workflow/README.md](docs/workflow/README.md).

**Repository:** https://github.com/afri-bit/candb-studio  
**Default branch:** `main`

## Active Technologies

- TypeScript + VS Code Extension API (`engines.vscode` in `package.json`)
- Svelte 5 + Vite (`webview-ui/`)
- Webpack bundle → `dist/extension.js`
- Mocha unit tests + `@vscode/test-electron` integration tests
- Speckit (`.specify/`, `specs/`) for feature SDD
- GitHub Issues / Discussions / PRs as intake (see `docs/workflow/`)

## Project Structure

```text
src/core/            Domain (CanDatabase, signals, messages) — no vscode
src/application/     CanDatabaseService, monitor, transmit, validation
src/infrastructure/  DBC parse/serialize, adapters, filesystem
src/presentation/    Custom editor, webview handler, tree, language
src/shared/          EventBus, Logger, constants
webview-ui/          Svelte apps: App.svelte (DB editor), SignalLabApp.svelte
test/unit/           Mocha tests (mirrors src/ layers)
test/integration/    VS Code host tests
specs/               Numbered feature specs (Speckit)
docs/adr/            Architecture Decision Records
docs/workflow/       GitHub + Cursor process
docs/architecture/   Layered extension-host guide
.cursor/             Commands, rules, agents, skills
```

## Commands

```bash
npm install && npm install --prefix webview-ui
npm run compile          # webview (Vite) + extension (webpack)
npm run lint
npm run test:unit
npm test                 # pretest compile + lint + vscode-test
npm run test:integration
```

Single unit file (after `npm run compile-tests`):

```bash
mocha --exit --ui tdd --require ./test/mocha-vscode-stub.cjs "out/test/unit/path/to/file.test.js"
```

## Code Style

- 4-space indent in `src/`; 2-space in `webview-ui/` (Prettier).
- Domain and parsers MUST NOT import `vscode`.
- Prefer small diffs; no drive-by refactors.
- Exported APIs: explicit types; `unknown` + narrowing at boundaries.

## Recent Changes

- GitHub-first agentic workflow: issues as agent briefs, ADRs, Speckit, PRs (`docs/workflow/`, `docs/adr/0001-…`).

## Start from a GitHub issue

1. Read the issue. The body is the brief (acceptance criteria, out of scope).
2. `/from-issue <n>` — classifies bug vs feature vs ADR.
3. Features: `/speckit.specify` (issue text) → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`.
4. PR: `Fixes #<n>`, link spec/ADR, run compile/lint/unit tests.

Constitution: `.specify/memory/constitution.md`.

## Protocol and serialization checklist

When changing the custom editor or Signal Lab:

1. Extend `WebviewToExtensionMessage` (and related types) in `src/presentation/webview/messages/WebviewMessageTypes.ts` and the Svelte callers.
2. Handle the message in `WebviewMessageHandler`; call `persistEditorDocument` after mutations that should save.
3. New database fields for the UI: update `serializeDatabaseForWebview.ts` **and** `webview-ui/src/lib/types` (and stores).

DBC domain (signal pool, `VAL_`, orphans, round-trip): `.cursor/skills/dbc-domain-and-serialization/SKILL.md`.

## Project agents

| Agent | Use for |
|-------|---------|
| `frontend-webview` | Svelte editor / Signal Lab UI |
| `vscode-extension` | Activation, commands, tree, language, host |
| `software-architect` | Layers, `docs/ARCHITECTURE.md` |
| `tester` | Unit / vscode-test |
| `automotive-can` | CAN/DBC bus semantics |
| `security` | Webview trust, file access |
| `refactoring` | Structured cleanup |

<!-- MANUAL ADDITIONS START -->
Workflow details: [docs/workflow/README.md](docs/workflow/README.md).  
ADR index: [docs/adr/README.md](docs/adr/README.md).  
Spec index: [specs/README.md](specs/README.md).
<!-- MANUAL ADDITIONS END -->
