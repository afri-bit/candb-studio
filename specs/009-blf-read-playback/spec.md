# Feature Specification: BLF Log Import and Playback

**Feature Branch**: `009-blf-read-playback`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: "Reading `.blf` data and eventually playback data."

**Sequence**: **Specification 009** — complements generic recording and playback in [Specification 008: CAN data recording and playback](../008-can-record-playback/spec.md) by targeting the **industry-standard Binary Logging Format (BLF)** files commonly exchanged between teams and tools. Decoded presentation aligns with [Specification 005: CAN bus connection and Signal Lab](../005-can-bus-signal-lab/spec.md). **Delivery is phased**: reliable **read/import** first; **playback** through the analysis UI as a follow-on capability.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a BLF file and inspect CAN traffic (Priority: P1)

An engineer receives a `.blf` log from a test run or supplier. They open it in the product and review **frames** (identifiers, payloads, timestamps as available) in a structured list or trace view, optionally with **database-backed decoding** when a matching DBC is loaded.

**Why this priority**: Interchange of BLF logs is routine in automotive workflows; reading is the minimum viable value.

**Independent Test**: Open reference BLF fixtures; confirm frame counts and key fields match a known-good reference viewer for the same file.

**Acceptance Scenarios**:

1. **Given** a supported `.blf` file, **When** the user opens it through the product, **Then** the product loads the log and presents CAN frame content for review without requiring a live bus.
2. **Given** a compatible DBC is loaded for decode, **When** the user inspects frames, **Then** signal decoding is applied consistently with live monitoring behavior for the same frame data.

---

### User Story 2 - Navigate large logs (Priority: P2)

The user scrolls, filters, or jumps by time or frame index within a large BLF so they can find events of interest without loading the entire capture into memory at once in a way that makes the UI unusable.

**Why this priority**: Real vehicle logs are long; usability depends on navigation affordances.

**Acceptance Scenarios**:

1. **Given** a multi-minute or large BLF, **When** the user navigates the log, **Then** the product remains responsive within documented limits and provides a clear indication of progress or partial loading if applicable.

---

### User Story 3 - Play back BLF content through the analysis pipeline (Priority: P3 — phased)

**Eventually**, the user **plays** the BLF so that monitoring-style views and charts behave like replay from [Specification 008](../008-can-record-playback/spec.md): time advances, decoded values update, and the user can pause or stop.

**Why this priority**: Playback completes the loop from “open log” to “experience like live” but may ship after read-only inspection.

**Acceptance Scenarios**:

1. **Given** playback is implemented for BLF, **When** the user starts playback with a loaded DBC, **Then** decoded signals and visualizations update in line with the log’s timing model.
2. **Given** playback is not yet available in a release, **When** the user opens a BLF, **Then** the product still delivers Story 1 (inspect frames) and communicates playback as upcoming or unsupported without false promises.

---

### Edge Cases

- **Unsupported BLF version or object types**: user sees which parts are skipped or unsupported, not silent wrong data.
- **Corrupt or truncated files**: clear error; no partial frames presented as valid without indication.
- **Missing DBC**: raw frame view remains useful; decoding is optional.
- **Platform or licensing**: where BLF support depends on third-party runtimes, prerequisites are documented (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to **open** `.blf` files from disk as a first-class workflow (for example, via open command or file association where the product supports it).
- **FR-002**: The product MUST **read** CAN-relevant content from supported BLF files and present it for **inspection** (frame list and essential metadata).
- **FR-003**: When a suitable DBC is active, the product MUST **decode** frames from BLF content using the same semantic rules as live traffic, subject to documented limitations.
- **FR-004**: For files or features not supported, the product MUST report **explicit limitations** (version, object types, channels) rather than failing silently.
- **FR-005** *(phased)*: The product SHOULD support **playback** of BLF content through the monitoring and visualization experience when this phase is delivered; until then, **read/inspect** remains the required scope.
- **FR-006**: Failures during open or parse MUST produce **actionable** user-visible messages.

### Key Entities

- **BLF log**: A binary logging file containing time-ordered bus events as defined by the format.
- **Imported session**: The in-product representation of frames and timing derived from a BLF.
- **Playback session** *(when implemented)*: Active replay driving the same UI surfaces as live or generic playback ([Specification 008](../008-can-record-playback/spec.md)).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users open a sample `.blf` and locate a specific frame ID within 3 minutes without external tools, after a one-page orientation.
- **SC-002**: For a validation corpus of BLF files, at least **95%** of contained CAN frames match reference extraction on ID, DLC, and payload in automated tests.
- **SC-003**: When playback is in scope for a milestone, **90%** of pilot users complete “play → pause → locate signal change” on a scripted scenario.

## Assumptions

- **BLF** refers to the common **Vector Binary Logging Format** used in many automotive toolchains; exact **version and object-type** coverage is defined per release and may grow over time.
- Some environments may require **vendor libraries or runtimes** for full BLF support; the product documents prerequisites clearly.
- **Playback timing** may be **wall-clock**, **accelerated**, or **stepped** depending on implementation; users see which mode applies.
- This specification does **not** require **writing** BLF from the product’s own recorder unless combined with Specification **008** in a later plan.
- Phasing: **Phase A** — read/inspect; **Phase B** — playback integration; release notes state which phase is shipped.
