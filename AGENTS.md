# CANdb Studio — agent guide

Guidance for **Cursor** (local and Cloud Agents). Humans: [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/workflow/README.md](docs/workflow/README.md).

**CANdb Studio** is a VS Code extension for `.dbc` (CAN database) files: structured editing via a custom Svelte editor, sidebar tree view, DBC syntax highlighting/language features, and optional bus monitoring/transmit via CAN adapters.

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

Four strict layers — domain must not depend on VS Code APIs:

```text
src/core/            Domain (CanDatabase, signals, messages) — no vscode
src/application/     CanDatabaseService, monitor, transmit, validation, virtual bus
src/infrastructure/  DBC parse/serialize, adapters, filesystem, codec
src/presentation/    Custom editor, webview handler, tree, language, Signal Lab panel
src/shared/          EventBus, Logger, constants
webview-ui/          Svelte 5 (Vite): App.svelte (DB editor), SignalLabApp.svelte
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
# Install (run both on first checkout)
npm install
npm install --prefix webview-ui

# Build
npm run compile          # webview (Vite) + extension (webpack)
npm run watch            # webpack watch; rebuild webview separately when webview-ui/ changes
npm run package          # production build (used for .vsix)
npm run vsix             # package .vsix with vsce

# Code quality
npm run lint             # ESLint on src/
npm run format           # Prettier: 4-space indent for src/, 2-space for webview-ui/
npm run format:check     # dry-run check only

# Tests
npm test                 # pretest (compile-tests + compile + lint) then vscode-test
npm run test:unit        # unit tests only: clears out/, compiles, runs mocha with vscode shim
npm run test:integration # integration tests in VS Code host only
```

Single unit file (after `npm run compile-tests`):

```bash
mocha --exit --ui tdd --require ./test/mocha-vscode-stub.cjs "out/test/unit/path/to/file.test.js"
```

After parser/serializer changes, extend tests under `test/unit/infrastructure/parsers/`.

## Architecture

**Activation flow** (`src/extension.ts`): EventBus → infrastructure → application services → presentation. `MonitorService` and `TransmitService` are created lazily only after a bus adapter connects.

**`CanDatabaseService`** is the central orchestrator: loads/saves `.dbc`, applies webview mutations, emits `database:loaded` / `database:changed` on the `EventBus`. The tree view, language providers, and Signal Lab all subscribe to these events.

**Signal model**: Signals live in a **global pool** keyed by name. Messages reference pool signals by name with per-frame placement (start bit, endianness, etc.). Signals not attached to any message are **unlinked** — they persist via a DBC extension block and appear under "Unlinked signals" in the sidebar.

**Virtual CAN simulation**: `VirtualBusSimulationService` drives `VirtualCanAdapter.injectFrameForMonitor`, which pushes `CanFrame` instances into the same `onFrameReceived` path `MonitorService` already subscribes to — decode, `EventBus` events, and Signal Lab charts behave identically to hardware traffic.

Layered diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Key file map

| Concern | Location |
|---|---|
| Activation & wiring | `src/extension.ts` |
| Load/save, mutations, events | `src/application/services/CanDatabaseService.ts` |
| Domain aggregate | `src/core/models/database/` |
| DBC parse/serialize | `src/infrastructure/parsers/dbc/` |
| Webview RPC types + handler | `src/presentation/webview/messages/WebviewMessageTypes.ts`, `WebviewMessageHandler.ts` |
| DB → webview JSON | `src/presentation/webview/serializeDatabaseForWebview.ts` |
| Custom editor | `src/presentation/editors/CanDatabaseEditorProvider.ts` |
| Sidebar tree | `src/presentation/views/treeview/` |
| Svelte DB editor | `webview-ui/src/App.svelte`, `webview-ui/src/lib/` |
| Signal Lab UI | `webview-ui/src/SignalLabApp.svelte` |
| CAN adapters | `src/infrastructure/adapters/` |
| Unit tests | `test/unit/` (mirrors `src/` layer structure) |

## Code Style

- 4-space indent in `src/`; 2-space in `webview-ui/` (Prettier).
- Domain and parsers MUST NOT import `vscode`.
- Prefer small, task-focused diffs; match existing naming, imports, and patterns in touched files.
- Exported APIs: explicit types; `unknown` + narrowing at boundaries.
- Keep `CHANGELOG.md` or `README.md` updates aligned with user requests — do not update them speculatively.

## Recent Changes

- GitHub-first agentic workflow: issues as agent briefs, ADRs, Speckit, PRs (`docs/workflow/`, `docs/adr/0001-…`).

## Start from a GitHub issue

1. Read the issue. The body is the brief (acceptance criteria, out of scope).
2. `/from-issue <n>` — classifies bug vs feature vs ADR.
3. Features: `/speckit.specify` (issue text) → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`.
4. PR: `Fixes #<n>`, link spec/ADR, run compile/lint/unit tests.

Constitution: `.specify/memory/constitution.md`.

**GitHub first:** actionable work starts as an issue in this repo; the issue body is the brief. Features that add capability use Speckit (`specs/`). Durable design choices use `docs/adr/`. See `docs/workflow/README.md`.

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

## Known limitations (as of 0.2.0)

- **SocketCAN**: appears in the UI but the backend is not implemented; only the **virtual** adapter works end-to-end.
- Multi-adapter support (PCAN, Vector, SLCAN, etc.) is not yet available.

<!-- MANUAL ADDITIONS START -->
Workflow details: [docs/workflow/README.md](docs/workflow/README.md).  
ADR index: [docs/adr/README.md](docs/adr/README.md).  
Spec index: [specs/README.md](specs/README.md).
<!-- MANUAL ADDITIONS END -->
