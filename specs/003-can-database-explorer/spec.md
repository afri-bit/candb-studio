# Feature Specification: CAN Database Explorer (Sidebar Tree)

**Feature Branch**: `003-can-database-explorer`  
**Created**: 2026-03-30  
**Last amended**: 2026-03-31  
**Status**: Approved (implemented)  
**Input**: User description: "Activity-bar tree to browse the active CAN database—nodes, messages, and signals—without opening the full visual editor."

**Sequence**: **Specification 003** — complements text and language services: **navigation** from the primary sidebar. Previous: [Specification 002](../002-dbc-language-services/spec.md). Next: [Specification 004: CAN Database Visual Editor](../004-can-database-visual-editor/spec.md). When multiple databases are open, **active context** rules are defined in [Specification 011: Workspace and active database context](../011-workspace-active-dbc/spec.md).

## Implementation status *(as-built)*

| ID | Requirement summary | Status | Notes |
|----|----------------------|--------|--------|
| FR-001 | Dedicated activity-bar area for CANdb Studio | **Implemented** | Views container `canbus-explorer` with branding. |
| FR-002 | Tree view of active database (nodes, messages, signals) | **Implemented** | `CAN Database` view; tree items for navigation context. |
| FR-003 | Tree refreshes when database loads or changes | **Implemented** | Subscribes to database loaded/changed events. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the active database from the sidebar (Priority: P1)

The user opens the CANdb Studio activity bar area and expands the CAN Database tree to see nodes, messages, and signals for the **active** database context.

**Why this priority**: Fast orientation and navigation alongside other editors.

**Independent Test**: Load a database; expand tree sections; confirm structure matches the database.

**Acceptance Scenarios**:

1. **Given** a database is active in the extension, **When** the user opens the CAN Database view, **Then** they see a hierarchical outline appropriate to that database.
2. **Given** the database is updated, **When** the change is applied through the product, **Then** the tree reflects the new structure without requiring a manual refresh in normal operation.

---

### Edge Cases

- No active database: tree shows empty or placeholder state consistent with product behavior.
- Very large databases: tree remains navigable within practical UI limits.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST provide a primary sidebar entry point (activity bar region) dedicated to CANdb Studio tools including the database explorer.
- **FR-002**: The product MUST show a tree (or equivalent hierarchical list) of the active database’s navigable entities (including nodes, messages, and signals as supported).
- **FR-003**: When the active database is loaded or modified, the explorer MUST update to reflect the current model under normal operation.

### Key Entities

- **Active database context**: The database session the explorer uses for its outline.
- **Tree item**: A navigable row representing a node, message, signal, or related grouping.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users locate a named message in the tree within 60 seconds on a mid-sized database after opening the view.
- **SC-002**: After a structural change to the database, the explorer matches the new content in 100% of automated UI integration tests that cover refresh.

## Assumptions

- Selection behavior (e.g., opening another editor) follows product conventions; deep linking may be extended over time.
