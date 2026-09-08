# Feature Specification: Signal layout grid and VAL_ display

**Feature Branch**: `014-signal-layout-and-val-display`  
**Created**: 2026-09-09  
**Status**: Implemented (0.3.0, unreleased)  
**Input**: Retrospective from [CHANGELOG 0.3.0](../../CHANGELOG.md) and contributor PR [#10](https://github.com/afri-bit/candb-studio/pull/10) (issues [#6](https://github.com/afri-bit/candb-studio/issues/6), [#8](https://github.com/afri-bit/candb-studio/issues/8), [#9](https://github.com/afri-bit/candb-studio/issues/9), [#11](https://github.com/afri-bit/candb-studio/issues/11)). Shipped without a spec; this document records the as-built behavior.

**Sequence**: **Specification 014** — incremental correctness of the [visual editor](../004-can-database-visual-editor/spec.md) (message **Layout** grid and signal **Value descriptions**). Motorola **codec** packing already landed in 0.2.0; this spec is the **editor visualization** and **VAL_ presentation** that must match that convention and the DBC on disk.

No ADR: the Vector CANdb++ Motorola walk and `VAL_` merge rules were already product decisions. This release aligns the UI with them.

## Implementation status *(as-built)*

| ID | Requirement summary | Status | Notes |
|----|----------------------|--------|--------|
| FR-001 | Motorola signals occupy the Vector sawtooth on the layout grid | **Implemented** | Occupancy is byte-order aware; Intel stays a linear span. |
| FR-002 | Grid columns match header: MSB left, LSB right within each byte | **Implemented** | Issue #11. |
| FR-003 | Layout LSB/MSB markers follow DBC start-bit meaning per endianness | **Implemented** | Motorola: `startBit` is MSB; Intel: `startBit` is LSB. |
| FR-004 | Signal **Value descriptions** tab shows `VAL_` / table labels after load and after save | **Implemented** | Issue #9. Effective labels include named value table + pool + per-message `VAL_`. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trust Motorola placement on the layout grid (Priority: P1)

An engineer opens a DBC that uses Motorola (big-endian) signals — the usual Vector / CANdb++ `@0` style — and opens the message **Layout** tab. The painted bits match Vector CANdb++ and the DBC `startBit`/`length`/`byte order`, not a little-endian linear span.

**Why this priority**: A wrong grid is worse than no grid: users will “fix” start bits that were already correct. Issues #6 and #8 reported this mismatch.

**Independent Test**: Open a message whose Motorola signals are defined like the #8 example (`VEHICLE_SPEED` `7|16@0+` and `GEAR_POS` `19|4@0+` on an 8-byte frame). Confirm `VEHICLE_SPEED` occupies the first two bytes and `GEAR_POS` occupies the low nibble of the third byte, matching Vector CANdb++ — not a little-endian smear.

**Acceptance Scenarios**:

1. **Given** a message with Motorola signals whose start bits follow Vector CANdb++ (MSB at `startBit`, walk right within a byte, then to the next byte’s MSB), **When** the user opens **Layout**, **Then** each signal’s highlighted bits are exactly those physical bits (no Intel linear fill).
2. **Given** a message that mixes Intel and Motorola signals, **When** the user opens **Layout**, **Then** each signal is painted with its own byte-order rule; overlap and unused-bit warnings still use those occupancy sets.
3. **Given** the same DBC opened in Vector CANdb++ (or an equivalent reference), **When** the user compares the two layout views, **Then** bit occupancy for Motorola signals matches.

---

### User Story 2 - Read the grid in the order the header claims (Priority: P1)

The layout grid header labels bits **b7 … b0** (MSB left, LSB right) inside each byte. The painted cells and LSB/MSB arrows use that same left-to-right meaning so the engineer does not have to mentally flip the row.

**Why this priority**: Header vs cells disagreeing is the #11 report; it makes Motorola errors harder to see.

**Independent Test**: On any multi-byte message, confirm column 0 of a byte row is bit 7 of that byte and column 7 is bit 0, and that a Motorola 16-bit signal starting at bit 7 paints the left side of byte 0 then the left side of byte 1 as Vector does.

**Acceptance Scenarios**:

1. **Given** the layout grid is visible, **When** the user reads a byte row, **Then** cells run MSB (left) to LSB (right), matching the header.
2. **Given** a Motorola signal and an Intel signal of the same length, **When** both are shown, **Then** LSB/MSB annotations use DBC meaning (Motorola MSB = `startBit`; Intel LSB = `startBit`) and the in-byte column order stays MSB-left for both.

---

### User Story 3 - See value descriptions after load and save (Priority: P1)

The engineer opens a DBC that already has `VAL_` (and/or a named `VAL_TABLE_` referenced by the signal). On the signal **Value descriptions** tab they see the raw→label pairs. After they add or edit labels in the UI and save, the same pairs remain visible when they reopen the file.

**Why this priority**: Labels were already persisted (#9: written to `.dbc`) but the editor showed an empty tab, so users thought data was lost.

**Independent Test**: Open `val_descriptions` (or any file with `VAL_` on a pool signal). Open Signals → Value descriptions. Labels appear. Edit one, save, reload: labels still appear.

**Acceptance Scenarios**:

1. **Given** a `.dbc` whose signals have `VAL_` lines (and/or a `VAL_TABLE_` reference), **When** the user opens the signal **Value descriptions** tab, **Then** the effective raw→label pairs are listed (not an empty editor).
2. **Given** the user adds or edits value descriptions in the visual editor and saves, **When** they reopen the same file, **Then** those descriptions still appear in the tab.
3. **Given** a signal uses both a named value table and extra `VAL_` overrides, **When** the tab is shown, **Then** the displayed set is the **effective** merge (table, then pool overrides, then per-message `VAL_` where DBC stores them), not only one source.

---

### Edge Cases

- **Zero-length or out-of-payload signals**: layout warns; it does not invent occupancy inside the DLC.
- **1-bit Motorola fields**: a single cell is both LSB and MSB; the grid still uses MSB-left columns.
- **CAN FD DLC** (12–64 bytes): occupancy uses `dlc × 8`; Motorola walk is unchanged.
- **Signal with no `VAL_` and no table**: the Value descriptions tab is empty (or a single blank row), not an error.
- **Unlinked pool signals**: descriptions that exist only as DBC `VAL_` on referencing messages still appear on the pool signal after reload (same merge as linked signals).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The message **Layout** view MUST paint each signal on the **physical bits it occupies given its byte order**. Motorola occupancy MUST follow the Vector CANdb++ sawtooth (MSB at `startBit`; decrement within a byte; jump to the next byte’s MSB at a byte boundary). Intel occupancy MUST remain a consecutive span from `startBit`.
- **FR-002**: Within each byte, the layout grid MUST display bits **MSB on the left and LSB on the right**, consistent with the grid header.
- **FR-003**: LSB/MSB callouts on the layout MUST use DBC start-bit semantics: Motorola `startBit` is the **MSB**; Intel `startBit` is the **LSB**.
- **FR-004**: The signal **Value descriptions** view MUST show the **effective** labels for the selected pool signal after open and after save/reload: named value table entries, pool-level descriptions, and per-message `VAL_` folded back so a DBC round-trip does not look empty.
- **FR-005**: Layout analysis (overlap, unused bits, out-of-payload) MUST use the same occupancy rule as FR-001 so warnings match what the user sees.

### Key Entities

- **Physical bit**: Index `0 … dlc×8−1` in the payload; layout cells are these indices, not a flattened Intel-only range.
- **Effective value descriptions**: Raw integer → label map after merging `VAL_TABLE_`, pool `VAL_`, and per-message `VAL_`.
- **Layout session**: The **Layout** tab of one selected message in the visual editor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For the #8 Motorola sample (16-bit `@0` at start 7, 4-bit `@0` at start 19, DLC 8), a reviewer who knows Vector CANdb++ confirms occupancy on first inspection without flipping endianness mentally.
- **SC-002**: Opening any fixture that contains `VAL_` shows a non-empty Value descriptions list for those signals; save and reopen does not clear the list.
- **SC-003**: Intel-only messages keep the same occupancy they had before 0.3.0 (no regression of little-endian layout).

## Assumptions

- Motorola **encode/decode** in the extension host and Signal Lab already follows Vector CANdb++ (0.2.0). This spec does not redefine the codec.
- Named value tables remain editable on their own tab ([Specification 004](../004-can-database-visual-editor/spec.md)); 014 only requires that **signal-level** effective labels are visible.
- No new DBC keywords or on-disk extension; serialization of `VAL_` / `VAL_TABLE_` is unchanged in intent.

## Out of scope

- Changing how start bits are **edited** (property grid still stores DBC start bit).
- Interactive drag-to-place on the grid.
- Signal Lab decode labels (this spec is the **database editor**).
- New ADRs or adapter work.

## Traceability

| Source | Role |
|--------|------|
| [#6](https://github.com/afri-bit/candb-studio/issues/6), [#8](https://github.com/afri-bit/candb-studio/issues/8) | Motorola layout mismatch vs Vector |
| [#11](https://github.com/afri-bit/candb-studio/issues/11) | Grid bit order vs header |
| [#9](https://github.com/afri-bit/candb-studio/issues/9) | `VAL_` not shown after load/save |
| [PR #10](https://github.com/afri-bit/candb-studio/pull/10) | Implementation (`feature/big-endian-layout-fix`) |
| CHANGELOG `[0.3.0]` | Release notes (unreleased; `package.json` may still be 0.2.0 until tag) |
