# Agent guidance — candb-studio

This repository is **CANdb Studio**, a VS Code extension for **DBC** (CAN database) editing, sidebar exploration, language features, and optional bus monitor/transmit when an adapter is connected.

## Documentation

- **Layering and data flow**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (authoritative for where components sit and how `.dbc` flows through the system).
- **DBC domain rules** (signal pool, `VAL_` merging, orphan pool signals, round-trip expectations): `.cursor/skills/dbc-domain-and-serialization/SKILL.md`.
- **Build layout and webview contracts**: `.cursor/skills/candb-studio-development/SKILL.md`.

## Tech stack

- **Extension host**: TypeScript, bundled with webpack to `dist/extension.js` (`package.json` → `main`).
- **Webview UI**: Svelte in `webview-ui/` (Vite build; `npm run build:webview` runs before webpack).

## Repository map (where to change what)

| Concern | Location |
|--------|----------|
| Activation, wiring | `src/extension.ts` |
| Load/save, mutations, events | `src/application/services/CanDatabaseService.ts` |
| Domain aggregate | `src/core/models/database/` |
| DBC parse/serialize | `src/infrastructure/parsers/dbc/` |
| Webview RPC types + handler | `src/presentation/webview/messages/WebviewMessageTypes.ts`, `WebviewMessageHandler.ts` |
| DB → webview JSON | `src/presentation/webview/serializeDatabaseForWebview.ts` |
| Custom editor | `src/presentation/editors/CanDatabaseEditorProvider.ts` |
| Sidebar tree | `src/presentation/views/treeview/` |
| Svelte app | `webview-ui/src/` |

## Architectural boundaries

- **Domain** (`CanDatabase`, signals, messages, nodes) must not depend on VS Code APIs.
- **Application services** orchestrate parsing, persistence, validation, and bus features; they emit on the shared **EventBus** where appropriate (`database:loaded`, `database:changed`, etc.).
- **Presentation** (editors, webview, tree, language providers) talks to **CanDatabaseService**; keep webview messages typed and consistent on both sides.

**Signal model**: signals live in a **global pool**; messages reference them by name with per-frame layout. Pool signals not attached to any frame are **unlinked**; they persist via extension/orphan handling — see architecture doc and `orphanSignalBlob.ts`.

## Commands (verify changes locally)

```bash
npm run compile      # webview build + webpack
npm run lint         # eslint on src/
npm test             # pretest runs compile-tests, compile, lint; then vscode-test
npm run test:coverage   # clean out/, unit tests + c8 coverage → coverage/
npm run test:integration # compile + integration tests only (VS Code host)
```

Use `npm run watch` for iterative extension work; rebuild webview when `webview-ui/` changes.

## Protocol and serialization checklist

When adding or changing editor/webview behavior:

1. Extend **`WebviewToExtensionMessage`** (and related types) in `WebviewMessageTypes.ts` and the Svelte callers.
2. Handle messages in **`WebviewMessageHandler`**; call **`persistEditorDocument`** after successful mutations when the document should be saved.
3. If the webview needs new database fields, update **`serializeDatabaseForWebview`** and **`webview-ui/src/lib/types`** (and stores) together.

## Cursor subagents (optional)

Specialized prompts live under `.cursor/agents/` — for example **frontend-webview**, **vscode-extension**, **automotive-can**, **tester**, **security**, **refactoring**, **software-architect**. Use them when the task fits their scope.

## Working conventions

- Prefer **minimal, task-focused diffs**; match existing naming, imports, and patterns in touched files.
- After parser/serializer changes, run compile and extend tests under `test/` (especially `test/unit/infrastructure/parsers/` when applicable).
- Do not add unsolicited documentation files beyond what the task requires; keep **CHANGELOG** or **README** updates aligned with user requests.
