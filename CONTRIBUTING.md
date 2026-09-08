# Contributing to CANdb Studio

Contributions are welcome: bug reports, documentation, tests, and focused pull requests. All of that happens in **one repository**: [afri-bit/candb-studio](https://github.com/afri-bit/candb-studio).

## Where to start

| Doc | What it is |
|-----|------------|
| [docs/workflow/README.md](docs/workflow/README.md) | GitHub + Cursor loop (issues, specs, ADRs, PRs) |
| [docs/workflow/github-setup.md](docs/workflow/github-setup.md) | One-time GitHub settings (Discussions, labels) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Extension host, services, webview, `.dbc` flow |
| [AGENTS.md](AGENTS.md) | Map, commands, webview/serialization checklist (for agents) |
| [docs/adr/README.md](docs/adr/README.md) | Architecture Decision Records |
| [specs/README.md](specs/README.md) | Speckit feature specs |
| DBC domain | [.cursor/skills/dbc-domain-and-serialization/SKILL.md](.cursor/skills/dbc-domain-and-serialization/SKILL.md) |

## GitHub first

**Discussions** = ideas, questions, RFCs. **Issues** = actionable work (the issue body is the brief for humans and Cursor). **Pull requests** = the change.

| I want to… | Open |
|------------|------|
| Suggest a capability | [Feature request](https://github.com/afri-bit/candb-studio/issues/new?template=feature_request.yml) (Discussion first if it is still fuzzy) |
| Report a defect | [Bug report](https://github.com/afri-bit/candb-studio/issues/new?template=bug_report.yml) |
| Propose a durable design choice | [ADR](https://github.com/afri-bit/candb-studio/issues/new?template=adr.yml) |
| Fix docs | [Documentation](https://github.com/afri-bit/candb-studio/issues/new?template=documentation.yml) |

Fill the form completely — especially **acceptance criteria** / **done when**. Label `agent-ready` when Cursor can implement from the issue alone.

### Good bug reports

- Short summary plus VS Code version, extension version, OS.
- Steps to reproduce (minimal `.dbc` if parsing or the editor is involved).
- Expected vs actual.
- Adapter / driver only if the bug is connect, monitor, or transmit.

## Pull requests

Changes are proposed via **PRs** against **`main`** ([GitHub Flow](https://guides.github.com/introduction/flow/index.html)). Use the PR template.

1. Create a branch from `main` (or let `/from-issue` / Speckit create one).
2. Keep the diff aligned with the linked issue. Match existing patterns in `src/` and `webview-ui/`.
3. Add or update **tests** when behavior changes.
4. Update **docs** (and an ADR if the decision is durable) when architecture or user-visible behavior changes.
5. Run **`npm run compile`**, **`npm run lint`**, and **`npm run test:unit`** (or **`npm test`** when integration is in scope) before opening the PR.
6. Reference the issue with `Fixes #<n>`. Link `specs/…` and `docs/adr/…` when they exist.

## Cursor / Speckit

If you use Cursor:

- `/from-issue <n>` — start from a GitHub issue
- `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement` — features that need a spec
- `/propose-adr` — write `docs/adr/NNNN-….md`

Constitution: [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Development setup

This is a standard **VS Code extension** with a **Svelte** webview. Overview: [Extension anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy).

```bash
git clone https://github.com/afri-bit/candb-studio.git
cd candb-studio

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
| `npm run test:unit` | Unit tests with mocha and a `vscode` shim |
| `npm run test:integration` | `test/integration/` in the real VS Code host |

Tests live under **`test/`**:

- **`test/unit/`** — parsers, codecs, domain, services (e.g. `test/unit/infrastructure/parsers/` for DBC).
- **`test/integration/`** — extension smoke tests (commands registered, etc.).

Parser or serializer changes should include or extend **unit** coverage where practical.

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
