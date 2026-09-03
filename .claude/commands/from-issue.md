---
description: Start work from a GitHub issue — classify, spec or fix, then implement toward a PR.
---

## User Input

```text
$ARGUMENTS
```

The argument is a **GitHub issue number** or **issue URL** for `afri-bit/candb-studio`. If empty, ask for one or use an issue URL already in the conversation.

## Goal

Turn that issue into the correct in-repo work (bugfix, Speckit feature, or ADR) and a pull request. The **issue body is the brief**. Do not replace it with a different problem.

Read `docs/workflow/README.md` and `.specify/memory/constitution.md` first.

## Steps

1. **Fetch the issue** (read-only):

   ```bash
   gh issue view <N> --repo afri-bit/candb-studio --json number,title,body,labels,url
   ```

   If `gh` fails, use the issue text the user pasted.

2. **Classify** from title, labels, and body:

   | Kind | Typical labels | Next |
   |------|----------------|------|
   | Bug / small fix | `bug` | Branch, reproduce, fix, tests, PR |
   | Feature | `enhancement`, `needs-spec` | `/speckit.specify` using the issue body as the feature description, then plan/tasks as needed |
   | ADR | `adr` | `/propose-adr` (or write `docs/adr/NNNN-….md` from the template) |
   | Docs | `documentation` | Edit the named docs only |

   If the brief is incomplete (missing steps, acceptance criteria, or problem statement), **stop**. List what is missing. Suggest the user add it and apply `agent-ready`. Do not guess product scope.

3. **Branch**
   - Cloud Agent / this environment: follow the required `cursor/<name>-407d` (or current environment) branch rules.
   - Local Speckit feature: `.specify/scripts/bash/create-new-feature.sh` via `/speckit.specify` (do not invent a second feature number).
   - Local bugfix: a short `fix/…` or `docs/…` branch from `main`.

4. **Implement**
   - Match existing layers (`src/core` has no `vscode`).
   - Behavior changes need tests under `test/unit/` and/or `test/integration/`.
   - Webview/protocol: keep `WebviewMessageTypes`, handler, `serializeDatabaseForWebview`, and `webview-ui` types in sync.
   - Use project agents when the change is in their area (`frontend-webview`, `vscode-extension`, `tester`, …).

5. **Close the loop**
   - PR uses `.github/PULL_REQUEST_TEMPLATE.md`.
   - First line of related issues: `Fixes #<n>`.
   - Link `specs/…` and `docs/adr/…` when they exist.
   - Comment on the GitHub issue with spec/ADR/PR paths (if you have a write path; Cloud Agents use `ManagePullRequest`, not `gh` for PRs).

## Output

Report: issue URL, classification, spec or ADR paths, what you changed, and PR URL when opened.
