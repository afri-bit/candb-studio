# Architecture Decision Records

ADRs record **durable choices** that are expensive to reverse: layering, protocols, persistence formats, adapter strategy, and similar.

They are **not** a substitute for GitHub issues. Start with an [ADR issue](https://github.com/afri-bit/candb-studio/issues/new?template=adr.yml) (and an RFC discussion if you still need debate). The accepted write-up lives here so agents and humans can find it later.

## When to write one

Write an ADR when two or more of these are true:

- The choice affects more than one layer (`src/core`, application services, webview protocol, DBC on-disk format).
- Reversing it later would need a migration, a protocol break, or a large rewrite.
- Contributors (including Cursor) will otherwise keep re-litigating the same question.

Skip an ADR for a localized bugfix, a copy change, or a feature that already has a Speckit spec and no contested design.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-github-first-agentic-workflow.md) | GitHub-first agentic workflow (issues, specs, ADRs, PRs) | Accepted |

## How to add an ADR

1. Open or reuse an ADR GitHub issue.
2. Copy [0000-template.md](0000-template.md) to `docs/adr/NNNN-short-title.md` (next free number, four digits).
3. Fill Context, Options, Decision, Consequences.
4. Open a PR. Status is **Proposed** until review; after merge to `main` set **Accepted** (or merge already Accepted if the issue discussion settled it).
5. Comment on the issue with the path.

In Cursor: `/propose-adr` or `/from-issue` on an ADR-labeled issue.

## Status

| Status | Meaning |
|--------|---------|
| Proposed | In a PR or still under review |
| Accepted | On `main`; follow it |
| Superseded | Replaced by a later ADR (link it) |
| Deprecated | No longer in force; explain why |

## Style

- One decision per file.
- Prefer short prose over process theater.
- Link the GitHub issue and any `specs/NNN-…` folder.
- If the decision changes layering or the webview protocol, update `docs/ARCHITECTURE.md` in the same PR when the code changes.
