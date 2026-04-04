# Implementation Plan: Virtual CAN Bus and Offline Simulation

**Branch**: `010-virtual-can-bus-sim` | **Date**: 2026-04-04 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/010-virtual-can-bus-sim/spec.md`

## Summary

Deliver a **software-only virtual CAN bus** that feeds the **same** monitoring, decode, and Signal Lab path as hardware (per spec 005), without requiring adapters. Users **start/stop** simulation, see **unambiguous virtual vs real** connection state, and **inject** synthetic frames:

- **P1**: DBC-aligned injection (message id / payload consistent with loaded database) and validation errors for invalid or unknown messages.
- **P2**: Manual one-off (partially exists via transmit), **periodic** injection, optional **scripted** sequences in a later milestone.
- **Product extension** (align spec in follow-up): optional **raw frame** injection (id + DLC + bytes) without a DBC for lab/probing—decode when possible, raw otherwise.

Technical approach: introduce a **virtual/simulation session** in the application layer that pushes `CanFrame` instances into `ICanBusAdapter` listeners (or a thin **SimulationAdapter** implementing the same interface) so `MonitorService` behavior stays unchanged. Extend **Signal Lab** webview protocol and **ConnectBus** / status UI for mode clarity.

## Technical Context

**Language/Version**: TypeScript 5.x (extension host), Svelte (webview-ui) per repo.  
**Primary Dependencies**: VS Code extension API, webpack bundle to `dist/extension.js`, existing `CanDatabase`, `CanFrame`, `MonitorService`, `ICanBusAdapter`.  
**Storage**: None persistent beyond workspace/editor state; optional `Memento` later for last virtual settings (out of v1 unless needed).  
**Testing**: `npm run test:unit` (Mocha) for domain/application; `npm run test:integration` for webview/extension flows where applicable.  
**Target Platform**: VS Code / Cursor on Windows, macOS, Linux (virtual mode must work **without** Linux SocketCAN).  
**Project Type**: VS Code extension + webview (Signal Lab).  
**Performance Goals**: Single-bus lab: injection and decode keep UI responsive at moderate frame rates; document upper bounds in `research.md`.  
**Constraints**: No VS Code imports in `src/core/domain`; typed webview messages; virtual vs hardware policy must be explicit (FR-005).  
**Scale/Scope**: v1 single bus, deterministic lab timing (not HIL-accurate per spec assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|-----------|--------|
| **I. TypeScript extension host** | Pass — feature extends existing `package.json` contributes; no manifest change unless new commands/views are added (document in PR). |
| **II. VS Code boundaries** | Pass — frame injection and validation use **core** decode/types; only presentation uses `vscode`. |
| **III. Build, tests, checks** | Pass — implementation MUST include unit tests for validation/injection helpers and updated integration where webview/protocol changes. |
| **IV. Small, purposeful changes** | Pass — ship in slices: P1 virtual session + DBC injection + status; then periodic; scripted optional. |

**Post-design**: No new constitution conflicts. Webview protocol extensions remain typed in `WebviewMessageTypes.ts`.

## Project Structure

### Documentation (this feature)

```text
specs/010-virtual-can-bus-sim/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1 (webview + host contracts)
└── tasks.md             # /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── application/services/     # MonitorService, new VirtualBusSimulationService (or extend bus orchestration)
├── infrastructure/adapters/  # VirtualCanAdapter today — extend or add SimulationCanAdapter
├── core/models/bus/          # CanFrame, decode inputs
├── core/interfaces/bus/      # ICanBusAdapter
├── presentation/
│   ├── webview/
│   │   ├── messages/WebviewMessageTypes.ts
│   │   └── WebviewMessageHandler.ts
│   └── commands/             # ConnectBusCommand, status bar
└── extension.ts              # wiring

webview-ui/src/               # Signal Lab UI — virtual mode, inject controls

test/
├── unit/                     # injection validation, frame builders
└── integration/              # optional webview scenarios
```

**Structure Decision**: Follow existing **AGENTS.md** layering: domain decode unchanged; application owns simulation session; presentation owns VS Code + webview. Reuse `MonitorService` by ensuring injected frames enter the same `onFrameReceived` path as live frames.

## Complexity Tracking

No constitution violations requiring justification.

## Phases (execution)

| Phase | Output | Status |
|-------|--------|--------|
| 0 | [research.md](./research.md) | Complete |
| 1 | [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md) | Complete |
| 2 | `tasks.md` via `/speckit.tasks` | Complete |

---

**Handoff**: Run **`/speckit.tasks`** with feature `010-virtual-can-bus-sim` to break the plan into tasks. Optional: **`/speckit.checklist`** for requirements checklist against implementation.
