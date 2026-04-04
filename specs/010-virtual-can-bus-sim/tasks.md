# Tasks: Virtual CAN Bus and Offline Simulation (Spec 010)

**Input**: Design documents from `/specs/010-virtual-can-bus-sim/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/README.md](./contracts/README.md)

**Tests**: Included — constitution requires automated tests for behavior changes; SC-002 calls for benchmark decode tests.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no ordering dependency within the same phase)
- **[USn]**: Maps to User Story *n* in [spec.md](./spec.md)

---

## Phase 1: Setup

**Purpose**: Align implementation with contracts and existing bus wiring before coding.

- [x] T001 Review `specs/010-virtual-can-bus-sim/contracts/README.md` and list additive fields/messages required in `src/presentation/webview/messages/WebviewMessageTypes.ts` (output: short note in PR or checklist comment).
- [x] T002 Trace current bus connect flow: `src/presentation/commands/ConnectBusCommand.ts`, `src/application/services/MonitorService.ts`, `src/infrastructure/adapters/AdapterFactory.ts`, `src/extension.ts` — document where `VirtualBusSimulationService` will attach (no functional change required in this task).

---

## Phase 2: Foundational (Blocking)

**Purpose**: Injection path into the same receive pipeline as hardware frames. **Blocks all user stories.**

- [x] T003 Implement `injectFrameForMonitor(frame: CanFrame): void` on `src/infrastructure/adapters/VirtualCanAdapter.ts` that notifies `onFrameReceived` subscribers (same path as incoming frames; do not require `send()` echo).
- [x] T004 Add `src/application/services/VirtualBusSimulationService.ts` owning session state (`idle` \| `running` \| `stopped` per `data-model.md`), holding adapter reference, exposing `start()`, `stop()`, `injectDbcAligned(messageId, data)` with FR-006 validation hooks.
- [x] T005 Register `VirtualBusSimulationService` in `src/extension.ts` and pass into `src/presentation/webview/WebviewMessageHandler.ts` (constructor or setter consistent with existing `MonitorService` wiring).
- [x] T006 Add unit tests in `test/unit/infrastructure/adapters/VirtualCanAdapter.test.ts` for `injectFrameForMonitor` vs existing `send()` loopback behavior.
- [x] T007 Add unit tests in `test/unit/application/services/VirtualBusSimulationService.test.ts` for start/stop and rejected invalid injection payloads.

**Checkpoint**: Simulation service can inject frames; monitor path receives them; tests pass.

---

## Phase 3: User Story 1 — Enable virtual bus and inject frames (Priority: P1) — MVP

**Goal**: FR-001, FR-002, FR-003, FR-004 — virtual mode, DBC-aligned injection, decode/charts parity with live traffic, start/stop, idle state.

**Independent test**: Load DBC → start virtual → inject valid message → decoded values/charts update → stop → traffic stops and UI idle.

### Tests (US1)

- [x] T008 [P] [US1] Add unit tests for DBC-aligned payload validation / error paths (FR-006) in `test/unit/application/services/VirtualBusInjectionValidation.test.ts` (or colocate with `VirtualBusSimulationService.test.ts` if preferred).

### Implementation (US1)

- [x] T009 [US1] Extend `src/presentation/webview/messages/WebviewMessageTypes.ts` with `virtualBus.start`, `virtualBus.stop`, `virtualBus.inject` (DBC-aligned) and extension→webview additions: `connectionMode`, `virtualBus.error` per `contracts/README.md`.
- [x] T010 [US1] Handle new message types in `src/presentation/webview/WebviewMessageHandler.ts`: delegate to `VirtualBusSimulationService`, call `MonitorService` start/stop as needed, surface validation errors via `postToSignalLab`.
- [x] T011 [US1] Ensure `MonitorService` in `src/application/services/MonitorService.ts` uses current `CanDatabase` for decode on injected frames; call `setDatabase` when active DBC changes during virtual session.
- [x] T012 [US1] Update `webview-ui/src/SignalLabApp.svelte` and/or `webview-ui/src/lib/components/bus/` panels to add **Start virtual / Stop** and **Inject** (DBC message + payload) wired to new webview messages.
- [x] T013 [US1] Run `npm run build --prefix webview-ui` via `npm run compile` at repo root and fix TypeScript/Svelte errors from protocol changes.

**Checkpoint**: MVP — virtual inject works end-to-end in Extension Development Host per `specs/010-virtual-can-bus-sim/quickstart.md`.

---

## Phase 4: User Story 3 — Clear virtual vs real (Priority: P1)

**Goal**: FR-005, User Story 3 — unambiguous virtual vs hardware; exclusive mode policy per `research.md`.

**Independent test**: Connect hardware → attempt virtual (or reverse) → user sees policy + confirmation; status always shows correct mode.

- [x] T014 [US3] Implement exclusive connection policy in `src/presentation/commands/ConnectBusCommand.ts` and `src/application/services/VirtualBusSimulationService.ts` (block or confirm switch between virtual simulation and real adapter per `research.md`).
- [x] T015 [US3] Include `connectionMode: 'disconnected' | 'virtual_simulation' | 'hardware'` in Signal Lab state push in `src/presentation/webview/WebviewMessageHandler.ts` (`pushSignalLabState` / `ExtensionToWebviewMessage`).
- [x] T016 [US3] Update `webview-ui/src/SignalLabApp.svelte` (and any bus status component) to display **Virtual simulation** vs **Hardware** vs **Disconnected** without ambiguous labels.
- [x] T017 [P] [US3] Add unit or integration coverage for mode transitions in `test/unit/presentation/ConnectBusVirtualExclusive.test.ts` (or extend existing command tests) if test harness allows; otherwise document manual steps in PR.

**Checkpoint**: FR-005 satisfied; SC-001 testable via guided UX checklist.

---

## Phase 5: User Story 2 — Manual, periodic, scripted (Priority: P2)

**Goal**: FR-007 — manual (partially US1), periodic virtual injection; scripted deferred unless scoped.

**Independent test**: Configure periodic message on virtual bus → frames appear at interval until stopped.

- [x] T018 [US2] When `connectionMode` is virtual simulation, route `transmit.startPeriodic` / `transmit.stopPeriodic` / `transmit.updatePeriodicPayload` in `src/presentation/webview/WebviewMessageHandler.ts` to `VirtualBusSimulationService` periodic injection (reuse timing approach from existing periodic transmit).
- [x] T019 [US2] Enforce minimum interval and concurrent periodic limits in `src/application/services/VirtualBusSimulationService.ts` per `specs/010-virtual-can-bus-sim/research.md`.
- [x] T020 [US2] Document scripted injection as **out of v1** or stub future `virtualBus.runScript` in `src/presentation/webview/messages/WebviewMessageTypes.ts` only if product approves same-release scope; otherwise add one-line deferral in `specs/010-virtual-can-bus-sim/research.md`.

**Checkpoint**: Periodic virtual injection works; scripted explicitly scoped.

---

## Phase 6: Polish & Cross-Cutting

- [x] T021 [P] Add SC-002 benchmark: fixed DBC fixture + injected frames with expected decode in `test/unit/application/services/VirtualBusSc002Benchmark.test.ts` (uses small `.dbc` string fixture or existing test database builder under `test/unit/`).
- [x] T022 Update `AGENTS.md` or `docs/ARCHITECTURE.md` with virtual bus session and layering (one short subsection) if contributor expectations change.
- [x] T023 Run full `npm run compile`, `npm run lint`, `npm run test:unit`, and `npm run test:integration` from repo root; fix regressions.
- [x] T024 Validate `specs/010-virtual-can-bus-sim/quickstart.md` smoke steps after implementation and adjust file paths if UI entry points moved.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|------------|--------|
| 1 Setup | — | 2 |
| 2 Foundational | 1 | 3, 4, 5 |
| 3 US1 (MVP) | 2 | Release demo |
| 4 US3 | 2 (integrates with US1 webview state) | — |
| 5 US2 | 3 (virtual path + periodic) | — |
| 6 Polish | 3–5 | — |

**Story order for sequential work**: US1 → US3 → US2 → Polish. US3 can start after T011/T012 if state contract is agreed.

---

## Parallel Opportunities

- **T008** (tests) can run in parallel with **T003**–**T005** once interfaces are known; **T009** must complete before **T010** (same protocol file then handler).
- **T016** (Svelte labels) can proceed in parallel with **T014**–**T015** if API is frozen after T009.
- **T021** benchmark test can run in parallel with **T022** docs.

---

## Implementation Strategy

### MVP (minimum release)

1. Complete Phase 1–2.
2. Complete Phase 3 (US1) including T008–T013.
3. Stop and validate with `quickstart.md` smoke test.

### Full spec 010 v1 (P1 + P2)

4. Phase 4 (US3), Phase 5 (US2), Phase 6.

---

## Metrics

| Metric | Value |
|--------|--------|
| Total tasks | 24 |
| US1 tasks | 6 (T008–T013) |
| US2 tasks | 3 (T018–T020) |
| US3 tasks | 4 (T014–T017) |
| Setup + Foundational + Polish | 10 (T001–T007, T021–T024) |

---

## Notes

- **Raw frame injection** (proposed FR-008) is **not** in this task list until `spec.md` is amended; add tasks after spec update.
- **tasks.md** path: `/Users/eqir1ib/workspace/private/vscode-canbus/specs/010-virtual-can-bus-sim/tasks.md`
