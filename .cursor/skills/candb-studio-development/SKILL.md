---
name: candb-studio-development
description: Builds, layout, and workflows for the candb-studio repo — extension host vs webview, compile steps, and where to change behavior. Use when implementing features, debugging the custom editor, or navigating src/ and webview-ui/.
---

# candb-studio development

## Build
- **Full compile**: `npm run compile` — runs `build:webview` (Vite) then webpack for `dist/extension.js`.
- **Webview only**: `npm run build --prefix webview-ui`.
- Extension entry: `package.json` → `main: ./dist/extension.js`.

## Formatting
- **Prettier** (root): `npm run format` formats `src/**/*.ts` and `webview-ui/**/*.{ts,svelte,css,js}` (4 spaces, `prettier-plugin-svelte` for `.svelte`).
- **Svelte check**: `npm run check --prefix webview-ui` before merging large UI changes.

## Repository map
| Area | Path |
|------|------|
| Extension activate / wiring | `src/extension.ts` |
| DBC load/save, edits | `src/application/services/CanDatabaseService.ts` |
| Webview RPC | `src/presentation/webview/WebviewMessageHandler.ts`, `messages/WebviewMessageTypes.ts` |
| Webview JSON projection | `src/presentation/webview/serializeDatabaseForWebview.ts` |
| DBC parse/write | `src/infrastructure/parsers/dbc/DbcParser.ts`, `DbcSerializer.ts` |
| Domain | `src/core/models/database/` |
| Svelte app | `webview-ui/src/App.svelte`, `webview-ui/src/lib/components/` |

## Contracts
- Extend **both** `WebviewToExtensionMessage` and webview postMessage call sites; handler must `persistEditorDocument` after successful mutations when appropriate.
- Serialized DB shape is consumed by Svelte stores — add fields in `serializeDatabaseForWebview` and `webview-ui/src/lib/types`.

## Agents
- UI work: see project agent **frontend-webview**.
- Host / VS Code API: **vscode-extension**.
