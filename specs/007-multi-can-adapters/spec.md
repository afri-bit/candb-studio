# Feature Specification: Multi-Vendor CAN Adapter Support (Read Path)

**Feature Branch**: `007-multi-can-adapters`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: "Support for data reading from different CAN devices: SocketCAN, Kvaser, and Vector CAN."

**Sequence**: **Specification 007** — extends the bus and monitoring baseline in [Specification 005: CAN bus connection and Signal Lab](../005-can-bus-signal-lab/spec.md) so users can **choose among major CAN interface families** and **receive frames** for decoding and visualization. It does not redefine DBC editing ([Specifications 001–004](../README.md)).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick an interface family and connect (Priority: P1)

An integrator works on Linux with SocketCAN, or in a lab with Kvaser or Vector hardware. They select the matching interface type, provide the required channel or device identifier (for example, a SocketCAN interface name or vendor-specific selection), and connect so the product can **read CAN frames** from that device.

**Why this priority**: Without explicit support per family, users rely on a single stack or workarounds; choosing the right backend is the gate for all read features.

**Independent Test**: With each supported family available in a test environment, a user completes connect → receive frames → disconnect without changing DBC workflows.

**Acceptance Scenarios**:

1. **Given** supported drivers and hardware for a listed family, **When** the user chooses that family and supplies valid connection parameters, **Then** the product establishes a read path and ingests frames from the bus.
2. **Given** connection parameters are invalid or hardware is absent, **When** the user attempts to connect, **Then** the product explains the failure in actionable terms (for example, missing device, permission, or driver).

---

### User Story 2 - Stable reading for monitoring and decode (Priority: P1)

After connection, live monitoring and database-backed decoding (as in Specification 005) consume the same logical frame stream regardless of which adapter family is active.

**Why this priority**: The value of multi-adapter support is lost if decode or Signal Lab behaves differently per vendor in ways users cannot predict.

**Independent Test**: On two different adapter families, the same DBC and traffic pattern yields the same decoded signal semantics (subject to timing and hardware limits).

**Acceptance Scenarios**:

1. **Given** a connection is active and a database is bound for decoding, **When** frames arrive, **Then** the product supplies them to the monitoring and decode pipeline without requiring a separate workflow per adapter family.

---

### User Story 3 - Understand prerequisites per environment (Priority: P2)

Before connecting, the user can discover which interface types are applicable on their OS and what they must install (vendor runtime, permissions, interface naming).

**Why this priority**: Reduces failed connections and support friction for mixed teams (Linux vs Windows, different OEM stacks).

**Acceptance Scenarios**:

1. **Given** the user opens connection options, **When** they review available interface families, **Then** they can see which types are offered and high-level prerequisites (for example, OS or driver expectations) without reading internal documentation first.

---

### Edge Cases

- **Mixed environments**: Behavior is defined per OS where a family is supported; unavailable families are hidden or clearly marked unsupported on that platform.
- **Permission errors** (for example, raw socket access): user sees a clear message, not a silent failure.
- **Bitrate / bus configuration mismatch**: user receives indication that traffic may be corrupt or absent rather than silent wrong decode.
- **Hot unplug**: connection fails gracefully; user can reconnect without restarting the whole editing session.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to select **SocketCAN**, **Kvaser**, and **Vector** as distinct CAN interface families when configuring a connection for **reading** frames, subject to platform and licensing constraints documented by the product.
- **FR-002**: For each supported family, the product MUST accept the minimum connection parameters required by that stack (for example, SocketCAN interface name; vendor-specific channel or device selection for Kvaser and Vector as defined by the product).
- **FR-003**: While connected, the product MUST **read** incoming CAN frames from the selected device and deliver them to the same frame-processing path used for monitoring and decoding.
- **FR-004**: If a selected family cannot be used (unsupported OS, missing driver, no device, or user cancellation), the product MUST surface a clear, non-misleading error and MUST NOT claim a live connection.
- **FR-005**: Users MUST be able to **disconnect** cleanly and, where applicable, release resources so a subsequent connection (same or different family) can be attempted without restarting the application.
- **FR-006**: Adapter-specific behavior MUST NOT change the meaning of decoded signals from the loaded database; frame content delivered upstream MUST remain consistent with standard CAN semantics.

### Key Entities

- **Interface family**: A vendor or OS stack (SocketCAN, Kvaser, Vector) selected for the connection.
- **Connection profile**: The parameters needed to attach to a channel (names, handles, bitrate where user-controlled).
- **Frame stream**: The sequence of CAN frames presented to monitoring and decode, independent of which adapter produced it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In controlled tests per supported family, users complete connect → observe live frames → disconnect within 5 minutes using only in-product guidance and published prerequisites.
- **SC-002**: For identical injected traffic on a test bench, decoded signal values match within expected tolerance across at least two different supported families in qualification runs.
- **SC-003**: At least 90% of simulated failure cases (missing driver, wrong interface name, unplug) produce user-visible error messages rated “understandable” in structured reviewer feedback.

## Assumptions

- **SocketCAN** is primarily relevant on **Linux** hosts with appropriate kernel and interface configuration; the product documents naming (for example `can0`) and typical permission needs.
- **Kvaser** and **Vector** depend on **vendor-supplied runtimes and drivers** and, for Vector, typical **license** constraints; users install OEM software outside the database editor.
- Bitrate and CAN FD capabilities follow what each stack exposes; if FD is out of scope for a release, the product states that clearly.
- Transmit and advanced features may build on the same adapters but **this specification** centers on **data reading** for monitoring and decode unless extended later.
