# Feature Specification: DBC Side-by-Side Comparison

**Feature Branch**: `006-dbc-side-by-side-compare`  
**Created**: 2026-04-02  
**Status**: Draft (planned; not implemented)  
**Input**: User description: "Add a way to compare two DBC files side-by-side and highlight signal and message differences"

**Sequence**: This is **Specification 006** — a planned enhancement **after** the shipped baseline in [Specifications 001](../001-dbc-language-syntax/spec.md)–[005](../005-can-bus-signal-lab/spec.md). Related bus work: [Specification 007: Multi-vendor CAN adapters](../007-multi-can-adapters/spec.md). **Follow-on**: [Specification 013: DBC merge and apply after comparison](../013-dbc-merge-apply/spec.md). This spec does not yet have a dedicated comparison mode in the product.

## Gap analysis *(current product)*

| Area | Today | This specification targets |
|------|--------|----------------------------|
| Two DBC files open | Users may open two files or editors manually | A **dedicated comparison session** with both sources tied to one workflow |
| Message/signal diff | No first-class semantic diff for messages and signals | **Classified** differences (only left / only right / both, changed) |
| Highlighting | General text highlighting per file | **Diff-specific** emphasis for message and signal changes |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a side-by-side comparison of two databases (Priority: P1)

A vehicle or tooling engineer has two versions of a CAN database (for example, before and after a supplier update). They want to place both databases next to each other in one place and see, at a glance, which messages exist in only one file, only the other, or in both.

**Why this priority**: Without a dedicated comparison view, people rely on manual diffing or external tools, which is slow and error-prone. Message-level visibility is the minimum useful outcome.

**Independent Test**: Can be validated by loading two representative DBC files and confirming that messages unique to each side and shared messages are distinguished without inspecting raw file text.

**Acceptance Scenarios**:

1. **Given** two valid CAN database files the user is allowed to compare, **When** the user starts a comparison with both selected, **Then** the product shows both sources in a side-by-side layout and indicates which messages appear only on the left, only on the right, or on both sides.
2. **Given** a comparison session is open, **When** the user scans the message lists, **Then** they can tell which messages are new, removed, or shared without using a generic text diff tool.

---

### User Story 2 - See signal-level differences within matching messages (Priority: P2)

For messages that exist in both databases, the engineer needs to know whether signals were added, removed, or changed (for example, scaling, offset, length, or naming), not only that the message row exists.

**Why this priority**: Message-level equality hides many real-world changes; signal-level insight is usually why someone opens a database diff.

**Independent Test**: Can be validated with paired files where only signal attributes differ inside a shared message; the user can see those differences without cross-referencing two separate editors.

**Acceptance Scenarios**:

1. **Given** two databases that share a message but differ in one or more signals, **When** the user inspects that message in the comparison, **Then** the product shows which signals differ and what changed at a human-readable level (for example, added/removed signal, or changed attribute).
2. **Given** a shared message with no signal differences, **When** the user inspects it, **Then** the product does not imply false signal-level changes.

---

### User Story 3 - Clear visual emphasis of differences (Priority: P3)

The user should not have to read every line to notice changes; differences relevant to messages and signals should stand out from stable content.

**Why this priority**: Highlighting reduces missed regressions when databases are large and reduces cognitive load.

**Independent Test**: Can be validated with sample files containing a mix of unchanged and changed items; observers can point to highlighted regions without searching the entire view.

**Acceptance Scenarios**:

1. **Given** a comparison with both message-level and signal-level differences, **When** the user views the comparison, **Then** changed or unique items are visually distinct from unchanged content using a consistent, explained emphasis (for example, a legend or inline cues).
2. **Given** two identical databases, **When** comparison finishes, **Then** the product clearly states that there are no differences at the supported levels of comparison.

---

### Edge Cases

- Two databases are byte-for-byte identical: user sees an explicit “no differences” (or equivalent) outcome.
- One selected source cannot be read or is not a valid database: user sees a clear, actionable message and the comparison does not silently succeed.
- A message exists only in one database: it appears as unique to that side without forcing a false match on the other.
- The same frame identifier appears in both files but with different message-level or signal-level content: the product treats them as a matched pair and surfaces attribute differences.
- Very large databases (many messages or signals): the comparison remains usable (for example, through scrolling and structured grouping); if full interactive performance cannot be guaranteed, the product communicates any practical limits honestly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to designate exactly two CAN database files (or two equivalent database sources supported by the product) for comparison.
- **FR-002**: The product MUST present both designated sources in a side-by-side layout while a comparison session is active.
- **FR-003**: The product MUST classify each message as present only in the first source, only in the second source, or present in both, using the matching rules described in Assumptions.
- **FR-004**: For messages present in both sources, the product MUST surface message-level attribute differences that affect how an engineer interprets the frame (for example, naming, timing, or size-related attributes as represented in the database).
- **FR-005**: For messages present in both sources, the product MUST surface signal-level differences, including signals that exist only on one side and attribute changes for signals that exist on both sides.
- **FR-006**: Message-level and signal-level differences MUST be visually distinguishable from unchanged content in the comparison view.
- **FR-007**: If either source is missing, unreadable, or not a supported database, the product MUST show a clear error state and MUST NOT present a misleading “no differences” result.
- **FR-008**: When there are no differences at the supported comparison depth, the product MUST communicate that outcome explicitly.

### Key Entities *(include if feature involves data)*

- **Comparison session**: The active pairing of two database sources and the derived difference results shown to the user.
- **Message (frame)**: A unit of comparison identified per Assumptions; carries attributes that may differ between sources.
- **Signal**: A named item within a message; may be added, removed, or changed between sources.
- **Difference**: A categorized change (for example, unique to left, unique to right, or modified on both sides) at message or signal level.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: First-time users can complete selecting two databases and opening the comparison view within 3 minutes without dedicated training documentation.
- **SC-002**: In structured usability tests with representative file pairs, at least 90% of participants correctly identify whether a given message is new, removed, or changed compared to the other file without using an external text diff.
- **SC-003**: For a shared message that contains signal-level changes, users can locate those signal differences within 60 seconds under typical office conditions.
- **SC-004**: When both databases have no supported differences, users receive an unambiguous “no differences” indication in 100% of validation cases for identical pairs.

## Assumptions

- Users are engineers or integrators who already work with CAN database files in their normal workflow; “DBC” refers to the text-based CAN database format the product already supports.
- Messages are matched between the two sources using each message’s canonical frame identifier (for example, CAN identifier) as the primary key, which is standard for comparing two DBC revisions.
- “Side-by-side” means a split view with one database on each side, not a single merged stream; both sources remain visible together during review.
- Comparing more than two files at once, merging databases from the comparison UI, and non-DBC formats are out of scope unless explicitly added later.
- Attribute-by-attribute comparison depth follows what the product already models for messages and signals (for example, layout and descriptive fields); binary or proprietary extensions not represented in the database model may be out of scope.
- Implementation will reuse the same domain model and parsing pipeline as [Specification 004: CAN Database Visual Editor](../004-can-database-visual-editor/spec.md).
