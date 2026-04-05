# Feature Specification: DBC Language Services (Completion, Hover, Diagnostics)

**Feature Branch**: `002-dbc-language-services`  
**Created**: 2026-03-30  
**Last amended**: 2026-03-30  
**Status**: Approved (implemented)  
**Input**: User description: "Editor assistance for DBC text—keyword completion, hovers for database symbols, and validation diagnostics."

**Sequence**: **Specification 002** — after [Specification 001](../001-dbc-language-syntax/spec.md). Depends on a loadable database model for hovers and diagnostics. Next: [Specification 003: CAN Database Explorer](../003-can-database-explorer/spec.md).

## Implementation status *(as-built)*

| ID | Requirement summary | Status | Notes |
|----|----------------------|--------|--------|
| FR-001 | Keyword completion in DBC text | **Implemented** | Completion provider for DBC keywords. |
| FR-002 | Hover information for symbols when database is available | **Implemented** | Hover resolves names against loaded database context. |
| FR-003 | Validation diagnostics (Problems) for loaded database | **Implemented** | `ValidationService` (duplicate IDs/names, DLC, ID range, signal bounds, transmitter references, factor warnings, etc.); diagnostic collection for DBC language. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete common DBC keywords (Priority: P1)

While typing in a `.dbc` file, the user gets suggestions for common keywords appropriate to the format.

**Why this priority**: Reduces typos in structural tokens before any semantic validation runs.

**Independent Test**: Trigger completion at representative positions and observe keyword suggestions.

**Acceptance Scenarios**:

1. **Given** a `.dbc` file is open in the text editor, **When** the user invokes completion where keywords apply, **Then** the product offers relevant DBC keyword suggestions.

---

### User Story 2 - Inspect symbols via hover (Priority: P2)

When a database is loaded in context, hovering a message or signal name shows a concise summary (for example, ID, bit layout, scaling).

**Why this priority**: Faster orientation than searching the structured editor for every lookup.

**Independent Test**: With a known database loaded, hover known symbols and compare to database content.

**Acceptance Scenarios**:

1. **Given** database context is available for hovers, **When** the user hovers a resolvable symbol, **Then** the product shows an informative hover for that symbol.

---

### User Story 3 - See validation issues in Problems (Priority: P1)

Structural and consistency problems (duplicate frame IDs, invalid DLC, signals past payload, etc.) appear as diagnostics so the user can jump to issues.

**Why this priority**: Prevents silent bad databases and aligns text editing with the same rules as structured tools.

**Independent Test**: Introduce a deliberate validation error in a test file; confirm a diagnostic appears with appropriate severity.

**Acceptance Scenarios**:

1. **Given** a database is loaded and validated, **When** the model violates a supported rule, **Then** the product surfaces a diagnostic for the user to inspect and fix.

---

### Edge Cases

- No database loaded: hovers may be limited; completion for keywords still applies where implemented.
- Partial parse: diagnostics reflect what the application can validate on the current model.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST offer completion assistance appropriate to DBC text editing for supported keyword contexts.
- **FR-002**: When database context is available, the product MUST provide hover details for symbols it can resolve (for example, messages and signals).
- **FR-003**: The product MUST run validation on the loaded database model and expose issues through the standard diagnostics experience (Problems), including severity levels appropriate to issue type.

### Key Entities

- **Diagnostic**: A validation finding tied to a location or path in the database model.
- **Resolvable symbol**: A name the hover provider can associate with model data for the active context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can trigger keyword completion successfully on first attempt in a usability session after brief orientation.
- **SC-002**: For prepared invalid databases, 100% of seeded validation rule violations appear as diagnostics in test runs.

## Assumptions

- Validation rules reflect the in-memory CAN database model; round-trip and editor specifics are in [Specification 004](../004-can-database-visual-editor/spec.md).
