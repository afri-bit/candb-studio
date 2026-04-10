# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**CANdb Studio** is a VS Code extension for `.dbc` (CAN database) files: structured editing via a custom Svelte editor, sidebar tree view, DBC syntax highlighting/language features, and optional bus monitoring/transmit via CAN adapters.

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

Run a single unit test file:
```bash
npm run compile-tests && mocha --exit --ui tdd --require ./test/mocha-vscode-stub.cjs "out/test/unit/path/to/file.test.js"
```

After parser/serializer changes, extend tests under `test/unit/infrastructure/parsers/`.

## Architecture

Four strict layers — domain must not depend on VS Code APIs:

```
src/
  core/           → Domain: CanDatabase aggregate, Signal/Message/Node models, interfaces
  infrastructure/ → DbcParser/DbcSerializer/DbcTokenizer, FileSystemRepository, CAN adapters, codec
  application/    → CanDatabaseService (central), MonitorService, TransmitService, ValidationService, VirtualBusSimulationService
  presentation/   → Custom editor, commands, language providers, tree view, WebviewMessageHandler, status bar, Signal Lab panel
  shared/         → EventBus, Logger, constants

webview-ui/       → Svelte 5 app (Vite), two entry points:
                    App.svelte (DB editor) and SignalLabApp.svelte (monitor/transmit/charts)
```

**Activation flow** (`src/extension.ts`): EventBus → infrastructure → application services → presentation. `MonitorService` and `TransmitService` are created lazily only after a bus adapter connects.

**`CanDatabaseService`** is the central orchestrator: loads/saves `.dbc`, applies webview mutations, emits `database:loaded` / `database:changed` on the `EventBus`. The tree view, language providers, and Signal Lab all subscribe to these events.

**Signal model**: Signals live in a **global pool** keyed by name. Messages reference pool signals by name with per-frame placement (start bit, endianness, etc.). Signals not attached to any message are **unlinked** — they persist via a DBC extension block and appear under "Unlinked signals" in the sidebar.

**Virtual CAN simulation**: `VirtualBusSimulationService` drives `VirtualCanAdapter.injectFrameForMonitor`, which pushes `CanFrame` instances into the same `onFrameReceived` path `MonitorService` already subscribes to — decode, `EventBus` events, and Signal Lab charts behave identically to hardware traffic.

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

## Webview ↔ extension protocol

When adding or changing editor/webview behavior:

1. Extend `WebviewToExtensionMessage` (and related types) in `WebviewMessageTypes.ts` and the Svelte callers.
2. Handle the message in `WebviewMessageHandler`; call `persistEditorDocument` after mutations that should save the file.
3. If the webview needs new database fields, update `serializeDatabaseForWebview.ts` **and** `webview-ui/src/lib/types` (and stores) together.

## Working conventions

- Prefer minimal, task-focused diffs; match existing naming, imports, and patterns in touched files.
- Keep `CHANGELOG.md` or `README.md` updates aligned with user requests — do not update them speculatively.

## Known limitations (as of 0.1.1)

- **SocketCAN**: appears in the UI but the backend is not implemented; only the **virtual** adapter works end-to-end.
- **Motorola (big-endian)** signal decode/encode is a stub — do not rely on correct physical values.
- Multi-adapter support (PCAN, Vector, SLCAN, etc.) is not yet available.
