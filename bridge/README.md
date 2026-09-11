# candb-bridge

A small Python process that bridges [python-can](https://python-can.readthedocs.io/)
to the **candb-studio** VS Code extension over newline-delimited **JSON-RPC 2.0**
on stdio. It lets the extension talk to vendor CAN hardware (PEAK/PCAN, Kvaser,
Vector, SocketCAN) without shipping native addons in the extension host.

See `specs/007-multi-can-adapters/architecture.md` in the extension repo for the
full protocol.

## Install

```bash
pip install candb-bridge
```

For PEAK PCAN-USB on Windows you also need the **PCAN-Basic** driver from PEAK,
plus the python-can PCAN extra:

```bash
pip install "candb-bridge[pcan]"
```

The extension launches the bridge as `python -m candb_bridge`. Override the
interpreter with the `CANDB_BRIDGE_PYTHON` environment variable if needed
(e.g. set it to `py` or an absolute path).

## Protocol summary

- On start the bridge emits a `ready` notification with `{version, capabilities}`.
- The extension replies with `ack`.
- Requests: `enumerate`, `connect`, `send`, `disconnect`.
- Notifications: `frame`, `state`, `ready`, `error`.
