# Research: Virtual CAN Bus (Spec 010)

## 1. Adapter shape: extend Virtual vs new SimulationAdapter

**Decision**: Keep **`VirtualCanAdapter`** as the **loopback/echo** implementation for backward compatibility; add a **`SimulationCanAdapter`** (or **`VirtualSimulationAdapter`**) that implements `ICanBusAdapter` and **injects** frames from an internal queue/timer without requiring a prior `send()` echo—**or** extend `VirtualCanAdapter` with an explicit **`injectFrameForMonitor(CanFrame)`** that notifies `onFrameReceived` subscribers (same as receive path).

**Rationale**: Spec requires **injection** independent of echo-only loopback. A dedicated method or adapter avoids overloading `send()` semantics (hardware sends on wire; simulation **pushes** to monitor).

**Alternatives considered**:  
- Only use `send()` + echo — fails for “receive-only” scripted traffic patterns and confuses tx/rx labeling.  
- Bypass adapter — would duplicate `MonitorService` wiring.

## 2. Exclusive virtual vs hardware (FR-005, User Story 3)

**Decision**: **Mutually exclusive** connection: connecting **virtual simulation** disconnects or blocks **SocketCAN/other real adapter** session, with a **confirmation** if switching while the other is active. Document exact copy in UI strings.

**Rationale**: Safety and spec acceptance — user must not confuse synthetic and vehicle traffic.

**Alternatives**: Allow both — rejected (ambiguous decode source without multi-bus spec).

## 3. Periodic and scripted injection (FR-007, P2)

**Decision**: **Phase 1**: reuse existing **periodic transmit** plumbing in `WebviewMessageHandler` where it already maps to adapter `send` at intervals; for simulation, route periodic ticks to **injection** into the monitor path. **Scripted**: defer to milestone 2 unless scope allows JSON/script format in same release—document **timing semantics** (best-effort, monotonic timestamps).

**v1 (2026-04)**: Scripted sequences (`virtualBus.runScript`) are **explicitly out of scope** for this release; only manual + periodic virtual injection ship.

**Rationale**: Avoid two divergent periodic systems.

## 4. Raw frame injection (product ask; not in baseline spec FRs)

**Decision**: Treat as **FR-008 (proposed)** in a spec amendment: allow **manual raw** CAN ID + extended flag + DLC + payload bytes **without** requiring a loaded message definition; show **decode only if** ID matches DBC, else **raw row** in UI. Validation: DLC vs data length, max DLC 8 (classic) unless FD scope added later.

**Rationale**: Lab workflows and parity with user expectations; does not replace DBC-aligned FR-002.

## 5. Rate limits / “large simulation rates”

**Decision**: Cap periodic **minimum interval** (e.g. ≥10 ms per message per v1) and max concurrent periodic tasks; document in README/quickstart. Profile if needed.

**Rationale**: Single-bus lab, keep UI stable on low-power laptops.

## 6. Timestamp semantics

**Decision**: Injected frames use `Date.now()` or monotonic `performance.now()`-derived ms; document **not** comparable to hardware timestamps for HIL.

**Rationale**: Matches spec assumption “best-effort.”
