# 0001. GitHub-first agentic workflow

- **Status**: Accepted
- **Date**: 2026-09-03
- **Issue**: (process; tracked in-repo)
- **Spec**: none (process, not a product capability)

## Context

CANdb Studio is a VS Code extension developed with **Cursor** and **Speckit**. Work was already split across issue forms, `specs/`, Cursor commands, and architecture docs, but there was no single rule for:

- Where an idea must start (chat vs Discussion vs Issue)
- When a feature needs a spec vs a bugfix PR
- Where durable design choices live
- How an agent should turn a GitHub issue into a branch and PR

Without that, issue bodies were too thin for an agent, Discussions were unused, ADRs did not exist, and `CONTRIBUTING.md` still pointed at the old `vscode-canbus` remote.

## Options

### Option A — Chat-first, GitHub later

Describe work only in Cursor chat; file issues after the fact.

- Pros: fast for a solo spike
- Cons: no durable brief; agents cannot resume from GitHub; review history is incomplete

### Option B — Specs-only, issues optional

Treat `specs/` as the only planning surface.

- Pros: Speckit is already in the repo
- Cons: bugs and small fixes do not need a spec folder; GitHub Issues stay empty; discussions have no home

### Option C — GitHub-first, specs and ADRs as artifacts (chosen)

**Discussions** for talk, **Issues** as the agent brief, **`specs/`** for feature SDD, **`docs/adr/`** for durable decisions, **PRs** to land code. One repository.

- Pros: humans and Cursor share the same intake; Speckit stays for features; ADRs stay searchable
- Cons: a bit more ceremony on large features; owner must enable Discussions once

## Decision

Use **one repository** (`afri-bit/candb-studio`) and this sequence:

1. Fuzzy ideas and RFCs → GitHub Discussions.
2. Actionable work → a structured GitHub Issue (the issue body is the agent brief).
3. Features that add capability → Speckit under `specs/NNN-name/`, linked from the issue.
4. Hard-to-reverse design choices → ADRs under `docs/adr/`.
5. Implementation in Cursor (`/from-issue`, then Speckit as needed).
6. Pull request with `Fixes #<n>` and links to spec/ADR.

Constitution (`.specify/memory/constitution.md`) still gates architecture and tests. Process details live in `docs/workflow/README.md`.

## Consequences

- Issue templates must collect acceptance criteria and enough context for Cursor.
- Discussions must be enabled on the GitHub repo (see `docs/workflow/github-setup.md`).
- Agents comment on the issue when they add a spec, ADR, or PR.
- `/speckit.taskstoissues` is optional and only for large features (child issues under the parent feature).

## Notes

Existing specs **001–013** remain valid. New features continue the `specs/` numbering; they should also have a GitHub issue from this ADR forward.
