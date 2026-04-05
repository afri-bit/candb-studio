# CANdb Studio Constitution

## Core Principles

### I. TypeScript extension host

The extension entrypoint is TypeScript compiled and bundled to `dist/extension.js` as declared in `package.json`. Code MUST target the VS Code engine range in `package.json` (`engines.vscode`). Public contribution surfaces (commands, views, custom editors) MUST remain consistent with the manifest.

### II. VS Code boundaries

`vscode` APIs and UI wiring live in the extension/presentation layer. Domain models and DBC parsing/serialization MUST NOT depend on VS Code imports so core behavior stays testable outside the editor.

### III. Build, tests, and checks before merge

Changes MUST pass `npm run compile` (including webview build where the repo defines it). Lint and the full relevant test commands MUST pass (`npm run lint`, `npm run test:unit` / `npm test` / `npm run test:integration` as appropriate to the change) before integration.

**Tests for implementations:** Any change that adds or modifies **behavior** (parsers, domain logic, services, extension commands, webview protocol handlers, etc.) MUST include **new or updated automated tests** that exercise that behavior—typically under `test/unit/` for pure logic and/or `test/integration/` when VS Code or the extension host is required. Exceptions: documentation-only edits, config-only changes with no runtime effect, or cases explicitly agreed in review when testing is infeasible (must be called out in the PR).

### IV. Small, purposeful changes

Prefer minimal diffs that solve one problem. New dependencies and new surface area require a clear reason aligned with the feature or fix.

## Stack & platform

- **Language**: TypeScript for the extension host; follow existing project layout under `src/`.
- **Client**: VS Code; behavior MUST respect documented activation and resource limits for extensions.
- **Webview UI** (where used): Built and versioned with the repo’s defined webview toolchain; protocol between host and webview stays typed and consistent with existing message types.

## Development workflow

- **Specs & plans**: Feature work MAY follow `.specify/` and `specs/` when used; `specs/README.md` lists numbered specifications in order. They do not override this constitution.
- **Documentation**: `docs/ARCHITECTURE.md` and `AGENTS.md` describe layering and commands; significant structural changes SHOULD update those when they affect contributor expectations.

## Governance

This constitution is the minimum bar for all changes. Conflicts with ad-hoc process are resolved in favor of these rules until the constitution is amended. Amendments: edit this file, bump **Last Amended**, and note the change briefly in the commit message.

**Version**: 1.1.0 | **Ratified**: 2026-03-29 | **Last Amended**: 2026-04-04
