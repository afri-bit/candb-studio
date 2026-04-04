# Feature Specification: Virtual CAN Bus and Offline Simulation

**Feature Branch**: `010-virtual-can-bus-sim`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: "Virtual CAN bus and simulation for offline development and testing—synthetic frames from the loaded DBC, Signal Lab behaves like live traffic, start/stop and clear virtual-vs-real state, single-bus lab scope; prefer Signal Lab workflow integration."

**Sequence**: **Specification 010** — extends [Specification 005: CAN bus connection and Signal Lab](../005-can-bus-signal-lab/spec.md) with a **software-only bus** so monitoring, decode, and visualization work **without physical hardware**. Complements [Specification 007: Multi-vendor CAN adapters](../007-multi-can-adapters/spec.md) (real devices) and [Specification 008: Recording and playback](../008-can-record-playback/spec.md) (persisted logs); the virtual bus is a **live-style synthetic source**, not a file replay unless explicitly combined later.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enable virtual bus and inject frames (Priority: P1)

An engineer loads a DBC, switches to a **virtual CAN bus**, and **injects** frames that conform to message definitions (identifier, DLC, payload layout). **Decoded signals** and **charts** in the monitoring experience update as they would for **live traffic**, so layouts and alarms can be rehearsed without an adapter.

**Why this priority**: Without injection, “virtual bus” is meaningless; this is the minimum viable simulation.

**Independent Test**: With a known DBC, inject a frame for a defined message; decoded values and time series match expectations for that payload.

**Acceptance Scenarios**:

1. **Given** a loaded database and virtual bus enabled, **When** the user injects a valid synthetic frame for a defined message, **Then** monitoring and decode show the same logical results as if that frame arrived from a real bus.
2. **Given** virtual bus is active, **When** the user stops simulation, **Then** synthetic traffic ceases and the UI shows an unambiguous idle or stopped state.

---

### User Story 2 - Manual, periodic, and scripted injection (Priority: P2)

The user sends **one-off** frames, schedules **periodic** transmission of defined messages, and (where supported) runs a **scripted** sequence of frames for repeatable tests.

**Why this priority**: Lab validation needs repetition and automation beyond single clicks.

**Acceptance Scenarios**:

1. **Given** virtual bus is running, **When** the user configures a periodic message from the database, **Then** frames appear on the defined interval until stopped or changed.
2. **Given** scripted injection is in scope for the release, **When** the user runs a script, **Then** frames are emitted in order with documented timing semantics.

---

### User Story 3 - Clear virtual vs real connection state (Priority: P1)

The user always knows whether they are on a **virtual** bus or a **physical** adapter, and cannot accidentally think synthetic data is from a vehicle bus.

**Why this priority**: Safety and trust—misread state causes wrong engineering conclusions.

**Acceptance Scenarios**:

1. **Given** both real and virtual modes exist, **When** the user views connection status, **Then** the product distinguishes **virtual simulation** from **hardware** without ambiguous wording.
2. **Given** the user attempts to enable virtual bus while hardware is connected (or vice versa), **Then** the product applies a clear policy (exclusive modes or explicit override) and explains it to the user.

---

### Edge Cases

- **Message not in DBC**: injection is rejected or flagged with an honest error, not silent mis-decode.
- **Invalid payload** (DLC mismatch, out-of-range bits): user receives a clear validation message.
- **No database loaded**: virtual injection is limited or blocked with guidance to load a DBC.
- **Large simulation rates**: behavior remains usable within documented limits for v1 single-bus lab use.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to enable a **virtual CAN bus** mode that does not require physical hardware for the core monitoring and decode experience.
- **FR-002**: Users MUST be able to **inject synthetic CAN frames** that respect **identifier, DLC, and byte layout** implied by the loaded database for the targeted message.
- **FR-003**: While virtual bus is active, **decoded signal values** and **visualization** (charts, numeric readouts) MUST update consistently with the same decode rules as **live traffic** in [Specification 005](../005-can-bus-signal-lab/spec.md).
- **FR-004**: The product MUST support **start** and **stop** of virtual simulation so users can control when synthetic traffic runs.
- **FR-005**: The product MUST show **connection state** that clearly distinguishes **virtual simulation** from **real adapter** connection.
- **FR-006**: When a frame references an **undefined message** or carries an **invalid payload** for the database, the product MUST surface an **explicit, honest error** (no silent acceptance of invalid data as valid decode).
- **FR-007**: The product SHOULD support **manual**, **periodic**, and (in a later milestone or the same release if scoped) **scripted** injection patterns as described in user stories.

### Key Entities

- **Virtual bus session**: Active software simulation producing a frame stream for decode and visualization.
- **Injection request**: A single or recurring synthetic frame specification tied to database-defined messages where applicable.
- **Connection mode**: Virtual vs physical (real adapter), mutually exclusive or combined per documented product rules.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In guided tests, users correctly identify **virtual vs hardware** mode in **100%** of randomized state presentations after a one-page primer.
- **SC-002**: For a benchmark set of injected frames and a fixed DBC, **decoded values** match expected physical values within **100%** of cases in automated tests.
- **SC-003**: Users complete **enable virtual bus → inject frame → observe chart change → stop** within **10 minutes** on first use with short onboarding.

## Assumptions

- **v1 scope**: **Single-bus**, **deterministic** simulation adequate for **lab** use; **not** bit-accurate timing versus a real ECU, **not** multi-bus gateways, **not** full **HIL**—unless added in a later specification.
- **UX**: Primary workflow stays inside the **existing Signal Lab–style monitoring path**; a **separate** scenario-editing surface is **out of scope for v1** unless product management explicitly adds it later.
- Virtual frames feed the **same logical monitoring pipeline** as hardware-sourced frames; ordering and timestamp semantics are **best-effort** and documented.
- Combining virtual injection with **file replay** ([008](../008-can-record-playback/spec.md)) is **not required** unless specified in a future spec.
