# GitHub project setup (one repository)

Do this once on [afri-bit/candb-studio](https://github.com/afri-bit/candb-studio). After it is done, daily work follows [README.md](README.md).

You need **admin** on the repo for settings toggles. Issue/PR templates in this tree apply automatically after they are on `main`.

## 1. Features to turn on

**Settings → General → Features**

| Feature | Setting | Why |
|---------|---------|-----|
| Issues | On | Features, bugs, ADRs, docs work items |
| Discussions | On | Ideas, Q&A, RFCs — talk before an issue exists |
| Preserve auto-generated releases / Projects | Optional | Not required for the agentic loop |

Discussions are **off** until you flip this switch. Templates under `.github/DISCUSSION_TEMPLATE/` do nothing until Discussions is enabled.

### Discussion categories (create after enabling)

**Settings → Discussions** (or the Discussions tab → edit categories):

| Category | Format | Suggested template |
|----------|--------|-------------------|
| Ideas | Open-ended | `ideas.yml` |
| Q&A | Question / answer | `q-a.yml` |
| RFCs | Open-ended | `rfc.yml` |
| Announcements | Announcement | (GitHub default) |

Map each category to the matching form if the UI offers “Category forms”.

## 2. Confirm Issues and pull requests

- **Settings → General → Features → Issues**: on.
- Default branch: **`main`** (this repo’s default).
- Branch protection on `main` is recommended: require PR + passing **Build and test** before merge.
- Do **not** split features into a second repository. Specs, ADRs, and code stay here.

## 3. Labels

Canonical list: [`.github/labels.yml`](../../.github/labels.yml).

After that file is on `main`, workflow **Sync labels** (`.github/workflows/sync-labels.yml`) applies names, colors, and descriptions. It does **not** delete labels that are missing from the file.

You can also run it manually: **Actions → Sync labels → Run workflow**.

Issue forms already apply `bug`, `enhancement`, `documentation`, or `adr`. Add `agent-ready` when the body is a complete brief. Add `area:*` during triage.

## 4. Templates (shipped in-repo)

| Path | Role |
|------|------|
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Feature — agent brief + acceptance criteria |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Bug — reproduce + expected/actual |
| `.github/ISSUE_TEMPLATE/adr.yml` | Architecture decision |
| `.github/ISSUE_TEMPLATE/documentation.yml` | Docs |
| `.github/ISSUE_TEMPLATE/config.yml` | Chooser + link to Discussions |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist |
| `.github/DISCUSSION_TEMPLATE/*.yml` | Ideas, Q&A, RFC |

Blank issues stay allowed so a quick note is still possible; prefer a form so Cursor gets structured fields.

## 5. Cursor Cloud Agents (optional)

If you use **Cursor Cloud Agents** on this repo:

1. Connect the GitHub app / Cloud Agent integration for `afri-bit/candb-studio`.
2. On an `agent-ready` issue, start an agent with the **issue URL** (or paste the issue body).
3. The agent should follow [README.md](README.md) and `/from-issue`.

Local Cursor is enough: clone the repo, open the issue in the browser, run `/from-issue <n>`.

## 6. Sanity check

- [ ] https://github.com/afri-bit/candb-studio/issues/new/choose shows Feature, Bug, ADR, Documentation
- [ ] https://github.com/afri-bit/candb-studio/discussions is not 404
- [ ] Opening a PR shows the pull request template
- [ ] Labels include `agent-ready`, `needs-spec`, `adr`, and `area:*`
