# Contributing to CANdb Studio

Contributions are welcome: bug reports, documentation improvements, tests, and focused pull requests.

## Where to start

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the extension host, services, webview, and `.dbc` flow fit together.
- **[AGENTS.md](AGENTS.md)** — repository map, build commands, and the **webview / serialization checklist** for editor changes.
- **DBC domain rules** (signal pool, `VAL_`, orphans, round-trip): [.cursor/skills/dbc-domain-and-serialization/SKILL.md](.cursor/skills/dbc-domain-and-serialization/SKILL.md)

## Workflow

We use **GitHub** for code, issues, and pull requests. Changes are proposed via **PRs** (e.g. [GitHub Flow](https://guides.github.com/introduction/flow/index.html)).

1. Fork the repo and create a branch from the default branch (this project often uses **`develop`**).
2. Make focused changes; match existing patterns in `src/` and `webview-ui/`.
3. Add or update **tests** when behavior changes (see below).
4. Update **docs** if you change user-visible behavior or architecture.
5. Run **`npm run compile`**, **`npm run lint`**, and **`npm test`** before opening a PR.

## Issues

Report bugs or suggest features via **[GitHub Issues](https://github.com/afri-bit/vscode-canbus/issues)** (adjust the URL if the repository is renamed).

**Good bug reports** usually include:

- Short summary and context (VS Code version, extension version, OS).
- Steps to reproduce (ideally with a **minimal `.dbc`** sample or snippet if parsing/serialization is involved).
- What you expected vs. what happened.
- Optional: adapter model / driver — only if the issue is about **bus** connect, monitor, or transmit.

## Development setup

This is a standard **VS Code extension** with a **Svelte** webview. Overview: [Extension anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy).

```bash
git clone https://github.com/afri-bit/vscode-canbus.git
cd vscode-canbus

npm install
npm install --prefix webview-ui

npm run compile
```

- Iterative work: `npm run watch` for the extension host; after **`webview-ui/`** changes, run a full `npm run compile` (or `npm run build --prefix webview-ui` as needed).

## Tests and quality

| Command | Purpose |
|---------|---------|
| `npm run compile` | Webview (Vite) + webpack bundle |
| `npm run lint` | ESLint on `src/` |
| `npm test` | Compile tests, compile, lint, then `vscode-test` |

Tests live under **`test/`**, including:

- **`test/unit/`** — parsers, codecs, domain, services (e.g. `test/unit/infrastructure/parsers/` for DBC).
- **`test/integration/`** — extension smoke tests (commands registered, etc.).

Parser or serializer changes should include or extend **unit** coverage where practical.

| Script | Purpose |
|--------|---------|
| `npm test` | Full suite: compile, lint, then **@vscode/test-electron** (all tests under `out/test/`). |
| `npm run test:coverage` | Clears `out/`, recompiles tests, runs **unit** tests under **c8** + mocha (minimal `vscode` shim). Writes `coverage/` (lcov, JSON summary, HTML). |
| `npm run test:integration` | Builds the extension, compiles tests, runs **only** `test/integration/` in the real VS Code host (useful locally; CI runs this step after coverage). |

## Code style

- Follow **existing** naming, imports, and structure in touched files.
- Run **`npm run lint`**; fix new warnings in code you add or edit.
- Prefer **small, reviewable PRs** over large mixed refactors unless agreed beforehand.

## Webview and protocol changes

If you change the custom editor or Signal Lab UI, keep **extension host** and **webview** in sync:

1. Extend **`WebviewToExtensionMessage`** (and related types) in `src/presentation/webview/messages/WebviewMessageTypes.ts` and the Svelte callers.
2. Handle messages in **`WebviewMessageHandler`**; call **`persistEditorDocument`** after successful mutations when the document should be saved.
3. If the webview needs new database fields, update **`serializeDatabaseForWebview`** and **`webview-ui/src/lib/types`** (and stores) together.

Details: [AGENTS.md](AGENTS.md) — “Protocol and serialization checklist”.

## License

By contributing, you agree your contributions are licensed under the same **[MIT License](LICENSE)** as the project.
