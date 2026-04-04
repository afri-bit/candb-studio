# Feature Specification: DBC Language and Syntax Highlighting

**Feature Branch**: `001-dbc-language-syntax`  
**Created**: 2026-03-29  
**Last amended**: 2026-03-30  
**Status**: Approved (implemented)  
**Input**: User description: "Register CAN database files as a first-class language and provide syntax highlighting for `.dbc` text."

**Sequence**: **Specification 001** — the first layer: users recognize `.dbc` as a supported format and read/edit it with **structure-aware coloring** in the text editor. Next: [Specification 002: DBC language services](../002-dbc-language-services/spec.md).

## Implementation status *(as-built)*

| ID | Requirement summary | Status | Notes |
|----|----------------------|--------|--------|
| FR-001 | `.dbc` files use the DBC language mode | **Implemented** | Language contribution with id `dbc`, file extension `.dbc`. |
| FR-002 | TextMate grammar colors DBC constructs | **Implemented** | `syntaxes/dbc.tmLanguage.json`, scope `source.dbc`. |
| FR-003 | Opening a `.dbc` activates language support | **Implemented** | Activation on `onLanguage:dbc` (and related entry points). |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a DBC and see colored structure (Priority: P1)

An engineer opens a `.dbc` file in the default text editor. Keywords, comments, strings, and common DBC constructs are visually distinct so the file is easier to scan than plain text.

**Why this priority**: Without this, every other feature still works on bytes—but usability and error avoidance in raw editing start here.

**Independent Test**: Open any valid `.dbc` in text mode and confirm multiple syntactic categories are distinguishable by color/style.

**Acceptance Scenarios**:

1. **Given** a `.dbc` file exists, **When** the user opens it as text, **Then** the editor applies DBC-appropriate highlighting (not generic plain text).
2. **Given** the user edits and saves, **When** they save valid changes, **Then** the file remains a normal `.dbc` on disk.

---

### Edge Cases

- Very large files: highlighting remains responsive within normal editor limits.
- Invalid or non-DBC content: coloring may be imperfect; parsing and validation are covered in other specifications.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST associate the standard `.dbc` file extension with a dedicated DBC language mode.
- **FR-002**: For DBC language mode, the product MUST provide syntax highlighting that distinguishes major syntactic categories (for example, comments, strings, keywords, and identifiers) in the text editor.
- **FR-003**: Opening or focusing a `.dbc` file MUST load this language support without requiring a separate manual configuration step by the user.

### Key Entities

- **DBC document**: A text file using the CAN database grammar as presented in the editor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a guided test, at least 85% of participants identify comments vs keywords vs string regions in a sample `.dbc` without using search.
- **SC-002**: First-time users open a `.dbc` and confirm “syntax coloring is on” within 30 seconds of opening the file.

## Assumptions

- Highlighting is **lexical** (TextMate-style); semantic analysis is specified in [Specification 002](../002-dbc-language-services/spec.md).
