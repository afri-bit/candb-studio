# Feature Specification: Workspace and Multi-Database Policy

**Feature Branch**: `011-workspace-active-dbc`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: "Workspace and multi-database policy—single predictable active database context for explorer, bus decode, and Signal Lab; parallel editing; obvious active selection; rules for switching while connected; edge cases and reproducibility; client-side only."

**Sequence**: **Specification 011** — cross-cutting **workspace behavior** that constrains how [Specification 003: CAN Database Explorer](../003-can-database-explorer/spec.md), [Specification 004: CAN database visual editor](../004-can-database-visual-editor/spec.md), and [Specification 005: CAN bus connection and Signal Lab](../005-can-bus-signal-lab/spec.md) resolve **which `.dbc`** is **the** database for shared commands and bus decode. Related: [Specification 007: Multi-vendor CAN adapters](../007-multi-can-adapters/spec.md), [Specification 010: Virtual CAN bus](../010-virtual-can-bus-sim/spec.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Always know which database is “active” (Priority: P1)

With several `.dbc` files open, the user can see **which database** currently drives the **sidebar explorer**, **bus decoding**, and **Signal Lab** context—via a **clear label**, **status**, or **picker**, not guesswork.

**Why this priority**: Wrong active database causes silent wrong decodes and eroded trust.

**Independent Test**: Open three databases; at each step, a moderator asks “which one is active?”—users answer correctly using only product affordances.

**Acceptance Scenarios**:

1. **Given** multiple databases are open, **When** the user views the primary workspace UI, **Then** they can identify the **active database context** without opening each file.
2. **Given** no database is suitable or none is selected, **When** the user attempts a bus or explorer action that needs a context, **Then** the product explains what is missing and how to proceed.

---

### User Story 2 - Edit many databases in parallel without cross-corruption (Priority: P1)

The user edits **database A** in one place and **database B** in another; saves and validations apply **per file**; changing focus does not **merge** or **overwrite** content between files.

**Why this priority**: Parallel editing is normal; data loss across files is unacceptable.

**Acceptance Scenarios**:

1. **Given** two databases are open and edited independently, **When** the user saves each, **Then** each file reflects only its own edits.
2. **Given** one file has **unsaved changes**, **When** the user switches focus or active context, **Then** the product preserves unsaved work per its standard dirty-document rules and does not silently discard changes.

---

### User Story 3 - Choose or change the active context predictably (Priority: P1)

The product defines **deterministic rules** for how the active database is chosen (for example, **last focused** database editor, **explicit “use for bus”** command, or **workspace-pinned** default) and documents them so **two users** following the same steps reach the **same** active context.

**Why this priority**: Reproducibility matters for teams, CI mental models, and support.

**Acceptance Scenarios**:

1. **Given** documented steps for opening the same files in the same order, **When** two users follow them, **Then** they observe the **same** active database context before any manual override.
2. **Given** the user invokes an **explicit** action to set the database used for bus/decode, **When** they do so, **Then** that choice takes precedence over implicit focus rules until changed or cleared per product policy.

---

### User Story 4 - Switching active database while bus or Signal Lab is active (Priority: P2)

While **connected**, **monitoring**, or **Signal Lab** is showing live or simulated traffic, the user changes which database is active. The product either **safely rebinding** decode to the new database (with **warning** if semantics change), or **blocks** the switch until the user **disconnects/stops**, with **clear messaging**—never silent wrong decode.

**Why this priority**: Bus sessions are high-risk for misinterpretation if context changes underneath.

**Acceptance Scenarios**:

1. **Given** monitoring is active, **When** the user changes the active database, **Then** the product applies its documented policy (rebind with notice, or require stop/disconnect) and the user understands the outcome.
2. **Given** decode would change meaning (different definitions for the same frame ID), **When** the user confirms or is warned, **Then** charts and values are consistent with the **current** active database after the switch.

---

### Edge Cases

- **No database loaded**: bus and decode features indicate unavailability; editing-only flows still work where applicable.
- **Unsaved changes**: switching focus or active pin does not silently save or discard; conflicts follow product edit rules.
- **Duplicate message IDs across different files**: each file’s **own** validation applies; **cross-file** duplicate-ID conflicts are **informational** or **ignored** at workspace level for v1 unless a later spec adds cross-database analysis.
- **Exclusive vs multi-bus**: v1 assumes **one active decode context** per workspace session for physical or virtual bus; **true multi-bus projects** (parallel decode contexts) are **out of scope** unless added later.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When multiple `.dbc` databases are open, the product MUST maintain a **single authoritative active database context** for features that assume one database: **explorer outline**, **active bus database / decode binding**, **Signal Lab decode context**, and **commands** that refer to “the” database without a file argument.
- **FR-002**: The product MUST make the **active database context** **visible** to the user (status, label, picker, or equivalent).
- **FR-003**: The product MUST document and implement **deterministic rules** for how the active context is selected, including at least **implicit** rules (for example, focus-based) and support for **explicit user override** to pin the bus/decode database where applicable.
- **FR-004**: Users MUST be able to **edit and save** multiple databases **in parallel** without cross-file mutation; **active context** MUST NOT imply automatic merging of databases.
- **FR-005**: When the user changes the active database while **bus monitoring**, **connection**, or **Signal Lab** traffic is active, the product MUST follow a **defined policy**: **safe rebind with user-visible consequence** or **block until stopped/disconnected**—never silent reassignment of decode.
- **FR-006**: If no active database is available for an operation that requires one, the product MUST show a **clear** message and MUST NOT pretend decode is valid.
- **FR-007**: For **reproducibility**, the product SHOULD support **workspace-scoped persistence** of an explicit active-database pin (or equivalent) where the host environment allows, so reopening the same folder restores documented behavior.

### Key Entities

- **Active database context**: The one database currently bound to shared explorer, bus decode, and Signal Lab assumptions.
- **Database instance**: A specific `.dbc` open in the workspace with its own dirty/save lifecycle.
- **Context selection rule**: The ordered combination of explicit pin, focus, and defaults that yields the active context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In moderated tests with three open databases, **≥ 90%** of participants correctly identify the active context **before** performing a bus action.
- **SC-002**: Scripted reproducibility: following the documented open order and pin steps yields the **same** active context in **100%** of trial runs on a clean session.
- **SC-003**: Simulated “switch while monitoring” scenarios: **0** cases of silent decode against the wrong database without user-visible indication in test checklists.

## Assumptions

- **Client-side only**: no server-side project store, no cross-workspace sync—see Out of scope below.
- **v1 bus/decode**: **one** active decode context; multi-bus / gateway-style parallel contexts are a **future** specification if needed.
- **Cross-file duplicate IDs** are not a workspace-level error in v1; per-file diagnostics remain authoritative.
- **Out of scope unless added later**: **merging** databases, **cross-file symbolic references** between DBCs, **enterprise** project servers, or **global** ID registries across unrelated files.
