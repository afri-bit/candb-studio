#!/usr/bin/env python3
"""
cantools_extract.py — DBC golden file generator for CANdb Studio cross-validation tests.

Usage:
    python3 test/scripts/cantools_extract.py <path/to/file.dbc> > test/fixtures/dbc/cantools_golden/<name>.json

Requires:
    pip3 install cantools

This script parses a DBC file using the cantools library (an independent, battle-tested
Python CAN implementation) and outputs a JSON golden file. The TypeScript cross-validation
tests (DbcCrossValidation.test.ts) read these golden files and compare them against the
candb-studio DbcParser output to detect semantic disagreements.

Golden files are committed to the repo once and read by CI without requiring Python.
Only regenerate when fixture DBC files change.
"""

import sys
import json
import cantools


def signal_to_dict(sig):
    return {
        "name": sig.name,
        "start_bit": sig.start,
        "length": sig.length,
        "byte_order": sig.byte_order,  # "little_endian" or "big_endian"
        "value_type": "signed" if sig.is_signed else "unsigned",
        "factor": float(sig.scale),
        "offset": float(sig.offset),
        "minimum": float(sig.minimum) if sig.minimum is not None else None,
        "maximum": float(sig.maximum) if sig.maximum is not None else None,
        "unit": sig.unit or "",
        "receivers": list(sig.receivers),
        "comment": sig.comment,
        "is_multiplexer": sig.is_multiplexer,
        "is_multiplexed": bool(sig.multiplexer_ids),
        "multiplexer_ids": list(sig.multiplexer_ids) if sig.multiplexer_ids else None,
        "choices": {str(k): str(v) for k, v in (sig.choices or {}).items()},
    }


def message_to_dict(msg):
    return {
        "id": msg.frame_id,
        "name": msg.name,
        "dlc": msg.length,
        "is_fd": msg.is_fd,
        "transmitter": msg.senders[0] if msg.senders else None,
        "comment": msg.comment,
        "signals": [signal_to_dict(s) for s in msg.signals],
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: cantools_extract.py <file.dbc>", file=sys.stderr)
        sys.exit(1)

    dbc_path = sys.argv[1]

    try:
        db = cantools.database.load_file(dbc_path)
    except Exception as e:
        print(f"Error loading {dbc_path}: {e}", file=sys.stderr)
        sys.exit(1)

    # Extract value tables if available (cantools stores these in db.dbc)
    value_tables = []
    if hasattr(db, "dbc") and db.dbc is not None and hasattr(db.dbc, "value_tables"):
        for name, table in db.dbc.value_tables.items():
            value_tables.append({
                "name": name,
                "entries": {str(k): str(v) for k, v in table.items()},
            })

    out = {
        "nodes": [n.name for n in db.nodes],
        "messages": [message_to_dict(m) for m in db.messages],
        "value_tables": value_tables,
    }

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
