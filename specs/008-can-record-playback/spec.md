# Feature Specification: CAN Data Recording and Playback

**Feature Branch**: `008-can-record-playback`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: "Recording and playback CAN data."

**Sequence**: **Specification 008** — builds on live CAN capture in [Specification 005: CAN bus connection and Signal Lab](../005-can-bus-signal-lab/spec.md) and may use the same frame stream regardless of adapter family ([Specification 007](../007-multi-can-adapters/spec.md)). It adds **persisted sessions** (record) and **simulated or offline replay** (playback) for analysis, sharing, and testing without a live bus. **Industry log interchange** (Vector BLF) is specified in [Specification 009: BLF import and playback](../009-blf-read-playback/spec.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a CAN session to a file (Priority: P1)

While connected to a bus (or receiving frames from a supported source), the user starts **recording**, captures traffic for a period, then **stops** and saves a durable **recording** they can reopen later. The recording preserves enough information to review frames in context (identifiers, payload, timing as defined by the product).

**Why this priority**: Field debugging and supplier handoffs depend on capturing what actually happened on the bus.

**Independent Test**: Record a known traffic pattern, stop, save, and verify the saved artifact opens and shows the expected sequence of frames under test conditions.

**Acceptance Scenarios**:

1. **Given** the product is receiving CAN frames, **When** the user starts recording and later stops, **Then** the product writes a saved recording to a user-chosen or confirmed location and confirms success.
2. **Given** recording is active, **When** the user stops or disconnects, **Then** the product avoids silent data loss: either the file is finalized, or the user is warned with recovery guidance.

---

### User Story 2 - Play back a recording through the same analysis path (Priority: P1)

The user opens a previously saved recording and **plays** it so that monitoring, database-backed decoding, and visualization behave like live traffic for review purposes (timing may be real-time, accelerated, or stepped—per product capabilities).

**Why this priority**: Offline analysis and demos must reuse the same mental model as Signal Lab without hardware.

**Independent Test**: Play back a recording with a matching DBC loaded; decoded signals and charts behave consistently with expectations from the same frames presented live.

**Acceptance Scenarios**:

1. **Given** a valid recording and a compatible database, **When** the user starts playback, **Then** frames feed the decode and visualization experience without requiring a physical bus connection.
2. **Given** playback is running, **When** the user stops or reaches the end, **Then** the UI returns to a clear idle state and the user can restart or load another file.

---

### User Story 3 - Control playback for review (Priority: P2)

The user pauses, resumes, or jumps within a recording (where supported) to inspect events around a fault or a specific message.

**Why this priority**: Long captures are unusable without navigation.

**Acceptance Scenarios**:

1. **Given** a multi-minute recording, **When** the user seeks or steps through the timeline, **Then** the product updates the visible frame list and decoded values to match the selected position.

---

### Edge Cases

- **Disk full or permission denied** while recording: user receives a clear error; partial files are handled per product policy (truncate, finalize header, or discard with warning).
- **Corrupt or foreign-format file** on open: user sees a readable error, not a crash.
- **Recording without a database**: raw frames are still storable; decode may be limited until a DBC is loaded.
- **Playback bitrate vs real time**: user understands whether timing is wall-clock accurate or best-effort.
- **Privacy / safety**: recording may capture vehicle data; assumptions below apply.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to **start** and **stop** recording of incoming CAN frames while a supported capture path is active.
- **FR-002**: Recordings MUST be **persisted** to storage as a file (or files) in a format the product documents, including essential frame fields needed for faithful replay and review.
- **FR-003**: Users MUST be able to **open** a saved recording and **play** it back through the product’s monitoring and decode pipeline without requiring live hardware for that session.
- **FR-004**: During playback, decoded signal values and visualizations MUST remain **consistent** with the same logical frames as in live mode, subject to documented timing behavior.
- **FR-005**: The product MUST provide **playback controls** appropriate to the release (at minimum start/stop; pause/resume and seek where specified).
- **FR-006**: Failures (save errors, read errors, unsupported format) MUST surface **clear, actionable messages** to the user.

### Key Entities

- **Recording**: A persisted sequence of CAN frames with associated metadata (timestamps, bus context) as defined by the product.
- **Playback session**: The active replay of a recording into the analysis UI.
- **Capture source**: Live bus or equivalent frame stream feeding the recorder.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability tests, users complete record → save → reopen → play back on a sample capture within 10 minutes using only in-product flows and short onboarding text.
- **SC-002**: For benchmark recordings, at least 95% of frames round-trip (recorded vs played) with matching ID and payload in automated tests.
- **SC-003**: Simulated failure cases (full disk, bad file) result in understandable messages for at least 90% of reviewers in a structured checklist.

## Assumptions

- Exact **file format** (proprietary container vs industry formats such as BLF/ASC) is an implementation choice; the product documents what it supports for interchange.
- **Legal and organizational** responsibility for recording in customer environments (consent, retention) lies with the user; the product may warn when starting capture.
- **Transmit during playback** is out of scope unless explicitly added; this spec focuses on **recording and playback** for read-side analysis.
- Live adapter behavior remains as in Specifications **005** and **007**; playback is an additional **source** of frames, not a replacement for safety-critical real-time guarantees.
