# Feature Specification: CAN Database Visual Editor

**Feature Branch**: `004-can-database-visual-editor`  
**Created**: 2026-03-31  
**Last amended**: 2026-03-31  
**Status**: Approved (implemented)  
**Input**: User description: "Structured editor for `.dbc` files—tabs for messages, signals, nodes, attributes, value tables, architecture; sync with disk; optional raw text view."

**Sequence**: **Specification 004** — the **primary editing surface** for semantic work on a database. Builds on [Specification 001](../001-dbc-language-syntax/spec.md)–[003](../003-can-database-explorer/spec.md). Next: [Specification 005: CAN Bus and Signal Lab](../005-can-bus-signal-lab/spec.md). Multi-file **active context**: [Specification 011](../011-workspace-active-dbc/spec.md).

## Implementation status *(as-built)*

| ID | Requirement summary | Status | Notes |
|----|----------------------|--------|--------|
| FR-001 | Open `.dbc` in structured visual editor | **Implemented** | Custom editor registration for `*.dbc`. |
| FR-002 | Parse → domain model → present in UI | **Implemented** | Same path as save/serialize. |
| FR-003 | Edits persist to `.dbc` on save | **Implemented** | Serialization through application service. |
| FR-004 | Tabs/sections for messages, signals, nodes, attributes, value tables, overview | **Implemented** | Webview UI (messages, signals, nodes, attributes, value tables, architecture). |
| FR-005 | Open same file as raw text from editor | **Implemented** | Text view / default editor integration. |
| FR-006 | Stay in sync with file on disk when appropriate | **Implemented** | Document sync strategy between host and webview. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit frames and signals without raw text (Priority: P1)

The user opens a `.dbc` with the visual editor and edits messages, signals, scaling, and related fields through forms and tables.

**Why this priority**: Core value for day-to-day DBC maintenance.

**Independent Test**: Perform edits only in the visual editor; save; reopen; confirm equivalence of logical content.

**Acceptance Scenarios**:

1. **Given** a database is opened in the visual editor, **When** the user changes a field and saves, **Then** the `.dbc` file updates accordingly.
2. **Given** the user switches to raw text view, **When** they edit and save, **Then** changes remain consistent with the structured model when parsed again (subject to documented serialization limits).

---

### User Story 2 - Navigate large databases via built-in explorer (Priority: P2)

The user uses the editor’s internal outline/explorer to jump to entities (e.g. messages, signals).

**Why this priority**: Matches mental model of CANdb-style workflows.

**Independent Test**: Select items in the internal explorer; confirm focus jumps to the correct detail area.

**Acceptance Scenarios**:

1. **Given** the visual editor is open, **When** the user selects an entity in the editor’s explorer, **Then** the UI navigates to the corresponding detail for that entity.

---

### Edge Cases

- Concurrent edits on disk: product follows its conflict/sync policy.
- Invalid content on load: user receives actionable feedback; no silent data loss.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to open a `.dbc` file in a dedicated **visual database editor** (not only a plain text buffer).
- **FR-002**: The visual editor MUST present the database through structured views for messages, signals, nodes, attributes, value tables, and a high-level overview, as supported by the product.
- **FR-003**: Edits made in the visual editor MUST be persisted through the standard save path and MUST serialize to valid DBC text subject to documented limitations.
- **FR-004**: Users MUST be able to open the same file in a **text** editing mode when they need raw line editing.
- **FR-005**: The product MUST keep the visual editor coherent with the on-disk document according to its documented synchronization rules.

### Key Entities

- **Visual editing session**: The open custom editor instance bound to one `.dbc` URI.
- **Serialized DBC**: The text form produced by the parser/serializer pipeline.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users complete a representative edit (rename signal, adjust factor) in under 3 minutes in the visual editor on a sample file after one orientation.
- **SC-002**: Round-trip tests: for a defined corpus of databases, save from the visual editor and re-parse without unexpected loss of modeled entities (per project round-trip policy).

## Assumptions

- Orphan pool signals and `VAL_` merging follow project domain rules (see repository architecture documentation).
- Bus tooling uses the same database model; see [Specification 005](../005-can-bus-signal-lab/spec.md).
