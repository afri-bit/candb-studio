---
description: Draft or update an Architecture Decision Record from a decision write-up or ADR issue.
---

## User Input

```text
$ARGUMENTS
```

Use the user text (and any linked GitHub ADR issue) as the decision. Read `docs/adr/README.md` and `docs/adr/0000-template.md`.

## Steps

1. If `$ARGUMENTS` is an issue number or URL, fetch it:

   ```bash
   gh issue view <N> --repo afri-bit/candb-studio --json number,title,body,labels,url
   ```

2. Confirm this is a **durable** choice (layers, protocol, on-disk format, adapter strategy). If it is a localized bugfix, say so and stop — no ADR.

3. List existing files in `docs/adr/` and take the **next** four-digit number (skip `0000-template.md`).

4. Write `docs/adr/NNNN-short-title.md`:
   - Status: **Proposed** until the user or review accepts it
   - Context, Options (at least two), Decision, Consequences
   - Link the GitHub issue

5. Add a row to the index in `docs/adr/README.md`.

6. If the user wants it landed, open a PR that only contains the ADR (unless the same change implements the decision).

## Output

ADR path, status, and a 3–5 line summary of the decision.
