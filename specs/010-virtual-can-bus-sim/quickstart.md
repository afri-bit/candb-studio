# Quickstart: Developing Virtual CAN (Spec 010)

## Prerequisites

- Node 22+, `npm ci` at repo root and `npm ci --prefix webview-ui`
- VS Code / Cursor for F5 extension launch

## Build

```bash
npm run compile
```

## Manual smoke test

1. Launch **Extension Development Host** (F5).
2. Open a `.dbc` and **Signal Lab** / bus features per [AGENTS.md](../../../AGENTS.md).
3. In Signal Lab, click **Start virtual simulation** (or connect **Virtual** from the status bar **Connect** command).
   - Confirm the ribbon shows **Virtual simulation** (not **Hardware adapter**).
   - On the **Transmit** tab, **Send once** with a loaded DBC injects via the virtual path; verify **Monitor** / **Charts** update.
   - Optional: use **Raw frame (no database)** on the Transmit tab for ID/DLC/payload-only sends (virtual path uses the same inject pipeline; decode applies when the ID matches the loaded DBC).
   - **Stop virtual simulation**; if you started from the ribbon (no prior Connect), the adapter disconnects—confirm idle / no spurious frames.

## Automated tests

```bash
npm run test:unit
npm run test:integration
```

Add tests under `test/unit/` for injection validation and under `test/integration/` for webview flows when stable.

## Related docs

- [spec.md](./spec.md) — requirements
- [research.md](./research.md) — decisions
- [contracts/README.md](./contracts/README.md) — message contracts
