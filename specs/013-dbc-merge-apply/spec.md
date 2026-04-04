# Feature Specification: DBC Merge and Apply After Comparison

**Feature Branch**: `013-dbc-merge-apply`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: "After side-by-side comparison, selectively apply differences between two DBC revisions into a target file with preview, conflict resolution, backup/undo, and no silent corruption."

**Sequence**: **Specification 013** — **follows** [Specification 006: DBC side-by-side comparison](../006-dbc-side-by-side-compare/spec.md). Comparison identifies **what** differs; merge/apply defines **how** users integrate chosen changes into a **single resulting database**. Builds on the domain and serialization expectations in [Specification 004: CAN database visual editor](../004-can-database-visual-editor/spec.md). Active-file rules may interact with [Specification 011: Workspace and active database context](../011-workspace-active-dbc/spec.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select changes and preview the merged result (Priority: P1)

After a comparison session, the user **checks** which messages, signals, or attributes to take from **side A** or **side B**, then sees a **preview** of the **combined DBC** before anything is written to disk.

**Why this priority**: Without selection and preview, merge is indistinguishable from dangerous bulk overwrite.

**Independent Test**: Given a pair of files with known differences, select a subset; preview matches expected merged model for that subset.

**Acceptance Scenarios**:

1. **Given** a completed comparison, **When** the user toggles inclusion of specific differences, **Then** the preview updates to reflect only those choices.
2. **Given** the user has made selections, **When** they review the preview, **Then** they can see **summarized impact** (counts or list of affected entities) before commit.

---

### User Story 2 - Apply to target with backup or safe new file (Priority: P1)

The user applies the preview to either **overwrite** an existing target (with **backup** or **undo** path per product policy) or **save as a new** `.dbc` file, then reopen or continue editing without hidden corruption.

**Why this priority**: Engineers must trust that they can recover from mistakes.

**Acceptance Scenarios**:

1. **Given** the user chooses **overwrite**, **When** they confirm apply, **Then** the product creates a **recoverable backup** or offers **undo** consistent with documented behavior before replacing the file.
2. **Given** the user chooses **save as new**, **When** they apply, **Then** the original sources remain unchanged unless the user edited them separately through normal editing flows.

---

### User Story 3 - Resolve conflicts with explicit choices (Priority: P1)

When changes **cannot** be combined automatically (for example, **same message ID** with **incompatible layout**, **renamed** signals with ambiguous mapping, **value-table** name or entry collisions), the product **stops** and presents **choices**: resolve with a guided option, **skip** that hunk, or **abort** the whole apply.

**Why this priority**: Silent merge into an invalid DBC breaks downstream tooling and vehicles.

**Acceptance Scenarios**:

1. **Given** a detected conflict, **When** the user reaches the apply step, **Then** they **cannot** finalize without **resolving or skipping** each blocking conflict, or **aborting**.
2. **Given** the user skips a conflicting item, **When** apply completes, **Then** the result is **consistent** and **documented** (what was skipped is summarized).

---

### User Story 4 - Continue from comparison workflow (Priority: P2)

The merge UI is reachable **from** the comparison experience without re-selecting files from scratch, preserving mental context.

**Acceptance Scenarios**:

1. **Given** an active comparison of database L and R, **When** the user starts merge/apply, **Then** L and R are **already bound** as sources unless the user explicitly changes them.

---

### Edge Cases

- **Unsaved edits** in the target: product warns or blocks until saved per policy.
- **Partial apply failure** mid-operation: no corrupt intermediate file; user sees error and prior state preserved.
- **Orphan pool signals and VAL_** merging: behavior follows project domain rules ([Specification 004](../004-can-database-visual-editor/spec.md)); conflicts surfaced like other entities.
- **Large databases**: selection and preview remain usable within documented limits.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST allow users to **select** which compared **differences** to include in a merge result (at minimum per **message** and **signal** granularity; finer attribute granularity where the comparison provides it).
- **FR-002**: Before writing, the product MUST show a **preview** of the **merged logical database** derived from selections.
- **FR-003**: Users MUST be able to **apply** the preview by **overwriting** a chosen target file **or** **saving as a new** file.
- **FR-004**: On **overwrite**, the product MUST provide a **recoverable path** (backup and/or undo) documented to the user before destructive replace.
- **FR-005**: **Conflicts** MUST be **surfaced** with **merge**, **skip**, or **abort** options; the product MUST NOT **silently** produce an invalid or unintended database.
- **FR-006**: After apply, the resulting file MUST **round-trip** through the product’s normal load/save expectations for DBC ([Specification 004](../004-can-database-visual-editor/spec.md)).
- **FR-007** *(phased)*: **Three-way merge** (base + two branches) MAY be delivered in a **later** milestone; **v1** focuses on **two-source** selective apply with explicit user choices.

### Key Entities

- **Merge plan**: The set of user selections mapping compared differences to a target outcome.
- **Preview database**: The in-memory result before persistence.
- **Conflict**: A structural or naming incompatibility that requires user resolution or skip.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability tests, **≥ 90%** of participants complete **select → preview → save as new** on a scripted pair within **15 minutes** after brief orientation.
- **SC-002**: In automated scenarios with **seeded conflicts**, **0** cases of **silent** apply without user acknowledgment of each conflict class.
- **SC-003**: For benchmark merge cases, **100%** of applied results **reload** without parse failure and match **expected** entity counts for the selected plan.

## Assumptions

- **Specification 006** (comparison) is **available** or developed **in parallel** so that merge consumes a **structured diff**; if comparison ships later, merge may ship in the same release only if diff data is available through another interim UI.
- **No automatic merge** without user review in v1.
- **Git**, **server-side** merge policy, and **cross-namespace** merges between unrelated product contexts are **out of scope** unless added later.
- **Undo** may be limited by host editor capabilities; **backup file** is an acceptable primary safety net when host undo cannot span the operation.
