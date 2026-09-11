"""candb-bridge: python-can ⇆ candb-studio JSON-RPC 2.0 bridge over stdio.

The VS Code extension (candb-studio) spawns this module as `python -m candb_bridge`
and speaks newline-delimited JSON-RPC 2.0 on stdio. All vendor-specific CAN
complexity lives here via python-can, keeping the extension host free of native
addons. See specs/007-multi-can-adapters/architecture.md.
"""

from __future__ import annotations

import json
import sys
import threading
from typing import Any, Optional

__version__ = "1.0.0"

# python-can interface families this bridge knows how to drive. Membership is
# reported to the extension in the `ready` handshake so the UI can hide
# backends whose bindings are not importable on this host.
_CANDIDATE_INTERFACES = ("pcan", "kvaser", "vector", "socketcan")


def _detect_capabilities() -> list[str]:
    """Return the subset of candidate interfaces whose python-can bindings import."""
    caps: list[str] = []
    try:
        import importlib

        for name in _CANDIDATE_INTERFACES:
            try:
                importlib.import_module(f"can.interfaces.{name}")
                caps.append(name)
            except Exception:
                # Binding/driver not available on this host — skip silently.
                continue
    except Exception:
        # python-can itself is missing; capabilities stay empty and connect will
        # surface an actionable error.
        pass
    return caps


class Bridge:
    """Owns the python-can bus and the JSON-RPC message loop."""

    def __init__(self) -> None:
        self._bus: Any = None
        self._notifier_stop = threading.Event()
        self._reader: Optional[threading.Thread] = None
        self._write_lock = threading.Lock()
        self._acked = False

    # ---- transport -----------------------------------------------------

    def _write(self, obj: dict[str, Any]) -> None:
        line = json.dumps(obj, separators=(",", ":"))
        with self._write_lock:
            sys.stdout.write(line + "\n")
            sys.stdout.flush()

    def _notify(self, method: str, params: dict[str, Any]) -> None:
        self._write({"jsonrpc": "2.0", "method": method, "params": params})

    def _reply(self, req_id: Any, result: dict[str, Any]) -> None:
        self._write({"jsonrpc": "2.0", "id": req_id, "result": result})

    def _reply_error(self, req_id: Any, code: int, message: str) -> None:
        self._write(
            {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}
        )

    # ---- lifecycle -----------------------------------------------------

    def run(self) -> None:
        self._notify(
            "ready", {"version": __version__, "capabilities": _detect_capabilities()}
        )
        for raw in sys.stdin:
            line = raw.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            self._dispatch(msg)

    def _dispatch(self, msg: dict[str, Any]) -> None:
        method = msg.get("method")
        req_id = msg.get("id")
        params = msg.get("params") or {}

        if method == "ack":
            self._acked = True
            return
        if method == "enumerate":
            self._handle_enumerate(req_id)
        elif method == "connect":
            self._handle_connect(req_id, params)
        elif method == "send":
            self._handle_send(req_id, params)
        elif method == "disconnect":
            self._handle_disconnect(req_id)
        elif req_id is not None:
            self._reply_error(req_id, -32601, f"Unknown method: {method}")

    # ---- commands ------------------------------------------------------

    def _handle_enumerate(self, req_id: Any) -> None:
        devices: list[dict[str, Any]] = []
        try:
            import can

            for cfg in can.detect_available_configs():
                iface = cfg.get("interface")
                channel = cfg.get("channel")
                if iface is None:
                    continue
                entry = next((d for d in devices if d["interface"] == iface), None)
                if entry is None:
                    entry = {"interface": iface, "channels": []}
                    devices.append(entry)
                if channel is not None and str(channel) not in entry["channels"]:
                    entry["channels"].append(str(channel))
        except Exception as exc:  # noqa: BLE001 - report to client, don't crash
            self._reply_error(req_id, -32000, f"enumerate failed: {exc}")
            return
        self._reply(req_id, {"devices": devices})

    def _handle_connect(self, req_id: Any, params: dict[str, Any]) -> None:
        interface = params.get("interface")
        channel = params.get("channel")
        bitrate = params.get("bitrate")
        fd_bitrate = params.get("fd_bitrate")
        self._notify("state", {"status": "connecting"})
        try:
            import can

            kwargs: dict[str, Any] = {
                "interface": interface,
                "channel": channel,
                "bitrate": bitrate,
            }
            if fd_bitrate:
                kwargs["fd"] = True
                kwargs["data_bitrate"] = fd_bitrate
            self._bus = can.Bus(**kwargs)
        except Exception as exc:  # noqa: BLE001
            self._notify("state", {"status": "error", "message": str(exc)})
            self._reply_error(req_id, -32001, f"connect failed: {exc}")
            return

        self._notifier_stop.clear()
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        self._reply(req_id, {"ok": True})
        self._notify("state", {"status": "connected"})

    def _handle_send(self, req_id: Any, params: dict[str, Any]) -> None:
        if self._bus is None:
            self._reply_error(req_id, -32002, "send failed: not connected")
            return
        try:
            import can

            msg = can.Message(
                arbitration_id=int(params.get("id", 0)),
                data=bytes(params.get("data", []) or []),
                is_extended_id=bool(params.get("extended", False)),
                is_fd=bool(params.get("fd", False)),
                bitrate_switch=bool(params.get("brs", False)),
            )
            self._bus.send(msg)
        except Exception as exc:  # noqa: BLE001
            self._reply_error(req_id, -32003, f"send failed: {exc}")
            return
        self._reply(req_id, {"ok": True})

    def _handle_disconnect(self, req_id: Any) -> None:
        self._teardown_bus()
        if req_id is not None:
            self._reply(req_id, {"ok": True})
        self._notify("state", {"status": "disconnected"})

    # ---- frame streaming ----------------------------------------------

    def _read_loop(self) -> None:
        bus = self._bus
        if bus is None:
            return
        while not self._notifier_stop.is_set():
            try:
                msg = bus.recv(timeout=0.25)
            except Exception as exc:  # noqa: BLE001
                self._notify("state", {"status": "error", "message": str(exc)})
                break
            if msg is None:
                continue
            self._notify(
                "frame",
                {
                    "id": msg.arbitration_id,
                    "data": list(msg.data),
                    "dlc": msg.dlc,
                    "extended": bool(msg.is_extended_id),
                    "fd": bool(getattr(msg, "is_fd", False)),
                    "brs": bool(getattr(msg, "bitrate_switch", False)),
                    "esi": bool(getattr(msg, "error_state_indicator", False)),
                    "timestamp": msg.timestamp,
                },
            )

    def _teardown_bus(self) -> None:
        self._notifier_stop.set()
        reader = self._reader
        if reader is not None and reader.is_alive():
            reader.join(timeout=1.0)
        self._reader = None
        if self._bus is not None:
            try:
                self._bus.shutdown()
            except Exception:
                pass
            self._bus = None


def main() -> None:
    try:
        Bridge().run()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
