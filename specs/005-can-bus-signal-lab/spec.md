# Feature Specification: CAN Bus Connection and Signal Lab

**Feature Branch**: `005-can-bus-signal-lab`  
**Created**: 2026-04-01  
**Last amended**: 2026-04-01  
**Status**: Approved (implemented)  
**Input**: User description: "Connect to a CAN adapter; monitor traffic; decode with the loaded database; transmit frames; visualize signals—plus compact Signal Lab entry in the sidebar and status feedback."

**Sequence**: **Specification 005** — **optional hardware** features. Depends on a loadable DBC from [Specification 004](../004-can-database-visual-editor/spec.md). Cross-cutting: [Specification 011: Workspace and active database context](../011-workspace-active-dbc/spec.md). Planned extensions: [Specification 006: DBC side-by-side comparison](../006-dbc-side-by-side-compare/spec.md), [Specification 007: Multi-vendor CAN adapters](../007-multi-can-adapters/spec.md), [Specification 008: CAN recording and playback](../008-can-record-playback/spec.md), [Specification 009: BLF import and playback](../009-blf-read-playback/spec.md), [Specification 010: Virtual CAN bus and simulation](../010-virtual-can-bus-sim/spec.md).

## Implementation status *(as-built)*

| ID | Requirement summary | Status | Notes |
|----|----------------------|--------|--------|
| FR-001 | Connect / disconnect from CAN bus (adapter-specific) | **Implemented** | Commands; adapter selection path. |
| FR-002 | Start / stop frame monitoring | **Implemented** | Monitor service; decoded when DB attached. |
| FR-003 | Decode frames using active database | **Implemented** | Decoder + active bus database URI sync. |
| FR-004 | Transmit CAN frames (including from DB definitions where supported) | **Implemented** | Transmit service; Signal Lab UI hooks. |
| FR-005 | Signal Lab main panel (monitor, transmit, charts) | **Implemented** | Webview panel + message handler. |
| FR-006 | Signal Lab sidebar strip + status bar indicators | **Implemented** | Webview view + status bar entries. |
| FR-007 | Connection status visible to user | **Implemented** | Connection status bar; UI state. |
| FR-008 | Editing works when bus unavailable | **Implemented** | No hard dependency on adapter for DBC editing. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect and monitor live traffic (Priority: P1)

The user connects a supported adapter, starts monitoring, and sees frames. When a database is active for the bus context, frames decode to messages and signals.

**Why this priority**: Monitoring is the basis for validation and debugging.

**Acceptance Scenarios**:

1. **Given** hardware and drivers allow connection, **When** the user connects and starts monitoring, **Then** the product shows incoming traffic and decoding uses the active database when available.
2. **Given** monitoring is active, **When** the user stops monitoring, **Then** capture stops without blocking file editing.

---

### User Story 2 - Transmit frames (Priority: P2)

The user sends frames—built from database definitions where the product supports it—over the connected bus.

**Why this priority**: Required for stimulation and loopback tests.

**Acceptance Scenarios**:

1. **Given** a connection and a loaded database, **When** the user sends a frame per product capabilities, **Then** the frame is emitted according to adapter support.

---

### User Story 3 - Signal Lab workspace (Priority: P1)

The user opens Signal Lab to access monitor streams, transmit controls, and signal visualization (charts) in one workspace; compact status is available from the sidebar/status bar.

**Why this priority**: Single place for live CAN work next to editing.

**Acceptance Scenarios**:

1. **Given** Signal Lab is opened, **When** the user works with monitor/transmit/chart areas, **Then** they can perform basic live workflows without leaving the extension’s primary flows.
2. **Given** no adapter is present, **When** the user opens Signal Lab, **Then** they receive clear feedback and database editing elsewhere remains available.

---

### Edge Cases

- Adapter disconnect: services tear down safely; UI reflects disconnected state.
- Wrong database for traffic: user can see unknown IDs or bad decodes; product does not fabricate plausible values.
- Periodic transmit / background activity: closing panels may leave bus activity—user is informed per product messaging.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to connect and disconnect from a CAN bus when a supported adapter path is available.
- **FR-002**: Users MUST be able to start and stop monitoring of CAN frames while connected.
- **FR-003**: When an active database is associated with the bus context, the product MUST decode received frames into messages and signals per that database.
- **FR-004**: Users MUST be able to transmit CAN frames subject to adapter capabilities, including workflows that use message definitions from the loaded database where implemented.
- **FR-005**: The product MUST provide a **Signal Lab** experience that aggregates monitoring, transmit, and signal visualization for interactive use.
- **FR-006**: The product MUST provide compact entry points (for example, sidebar and status bar) showing Signal Lab / connection activity state at a glance.
- **FR-007**: Connection and activity state MUST be visible so users know whether they are connected, monitoring, or transmitting.
- **FR-008**: Database authoring MUST remain usable without any bus hardware (Specifications 001–004).

### Key Entities

- **Bus session**: Adapter handle, connection state, and active monitoring/transmit state.
- **Active bus database**: The database used for decode (and encode where applicable) for the bus context.
- **Signal Lab session**: User-facing aggregate of monitor, transmit, and visualization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a validated test bench, decoded signal values update within 2 seconds of a controlled bus change, or the UI explains why not.
- **SC-002**: In tests without hardware, users can still complete a full DBC edit workflow without being blocked by Signal Lab.
- **SC-003**: At least 90% of usability participants interpret connection vs disconnected state correctly from status affordances alone.

## Assumptions

- Adapter families and channel naming are documented; behavior is best-effort across hardware until validated per environment.
- Visualization types include numeric and time-series style views suitable for engineering review.
