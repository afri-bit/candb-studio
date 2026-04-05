# Change Log

All notable changes to the **candb-studio** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-04-05

### Added

- **DBC language support** — `.dbc` file association, TextMate grammar, and basic editor integration.
- **CAN Database Editor** — custom editor (structured UI) for opening and editing databases alongside plain-text `.dbc` editing.
- **CAN Database explorer** — activity bar view to browse nodes, messages, signals, and related structure for the active database.
- **DBC model** — parse and serialize DBC text through an internal model (nodes, frames, global signal pool, value tables, attributes).
- **CAN Signal Lab** — webview panel for live monitoring and transmit workflows when a bus connection is available.
- **Bus commands** — connect / disconnect, start / stop monitor, and transmit message (behavior depends on adapter and environment).
- **Adapter selection** — connect flow with **virtual** in-process loopback for development without hardware, and **SocketCAN** as the hardware-oriented path (still evolving).
