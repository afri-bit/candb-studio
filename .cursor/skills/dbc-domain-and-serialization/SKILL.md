---
name: dbc-domain-and-serialization
description: CANdb domain rules in candb-studio — signal pool, message references, value tables, VAL_ merging, orphan pool signals, and DBC round-trip expectations. Use when editing parsers, serializers, CanDatabase, or value-description logic.
---

# DBC domain and serialization (this repo)

## Core ideas
- **`CanDatabase`** holds nodes, messages, **signal pool**, value tables, attributes, etc.
- **Messages** reference pool signals by name; resolved layout uses `Message.getResolvedSignals(pool, db)`.
- **Value tables** (`ValueTable`): name, optional `comment` (`CM_ VAL_TABLE_`), `entries` map raw integer → label.
- **Signals** may set `valueTableName`; effective value labels merge table + per-signal/per-message `VAL_` via `valueDescriptionMerge.ts`.

## Serialization notes
- **Empty** `VAL_TABLE_ Name ;` must parse and round-trip (name-only line).
- **Orphan pool signals** (not on any frame) persist in extension block — see `orphanSignalBlob.ts` and serializer.
- After changing parser or serializer, run compile and add/extend tests under `test/unit/infrastructure/parsers/` when possible.

## Automotive context
- Raw values are integers in tables unless project explicitly supports floats elsewhere.
- For bus semantics (CAN, packing, OEM quirks), prefer project agent **automotive-can**.
