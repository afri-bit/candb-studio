# Change Log

All notable changes to the **candb-studio** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - tbd

### Added

- **CM_ comment parsing** — `CM_` entries for the network, nodes (`BU_`), messages (`BO_`), and signals (`SG_`) are now parsed from DBC files and stored on their respective domain objects. Multi-line comments (comment text spanning multiple lines before the closing `";`) are fully supported.
- **CM_ comment serialization** — comments are written back to DBC text by the serializer, enabling lossless save/re-open round-trips for all comment types.
- **BA_ attribute value parsing** — `BA_` lines are parsed for all four scopes: network, node (`BU_`), message (`BO_`), and signal (`SG_`). Both numeric (integer / float) and quoted string values are handled.
- **BA_ attribute value serialization** — parsed attribute values are written back to DBC text, completing the round-trip for `BA_DEF_` / `BA_DEF_DEF_` / `BA_` blocks.
- **Motorola (big-endian) signal codec** — full implementation of Motorola bit extraction and packing in `SignalDecoder` and `SignalEncoder`, replacing the previous no-op stubs. Both encoder and decoder now use the Vector CANdb++ convention (MSB at `startBit`, navigate right within a byte and jump to the next byte's MSB at each byte boundary).
- **Webview transmit codec alignment** — `transmitCodec.ts` Motorola encode/decode updated to match the same Vector CANdb++ convention used by the extension host, eliminating the mismatch that caused the Signal Lab transmit panel to write signal bits to different byte positions than the monitor decoder read them from.

### Fixed

- **Parser guard against unterminated CM_ entries** — added a structural keyword boundary check in `parseCmLines` so that a `CM_` comment missing its closing `";` terminator no longer consumes subsequent `BO_`, `BA_`, `VAL_`, and other section lines. Previously, a single malformed comment could silently swallow all messages and signals that followed it in the file, resulting in an empty database editor.
- **Signal physical value stuck at offset** — transmitting a Motorola signal from the Signal Lab panel and then reading it back on the monitor always showed the signal's offset value (e.g. −40 °C for `IndoorTemperature`) because the webview encoded bits into different byte positions than the extension host decoded from. Fixed by aligning both sides to the same Motorola bit-layout convention.

## [0.1.1] - 2026-04-10

### Fixed

- **Database editor detail tabs** — switching the selected message, signal, node, or attribute in the list no longer resets the right-hand pane to the Definition tab; the active tab stays selected while you browse items in the same editor.

## [0.1.0] - 2026-04-05

### Added

- **DBC language support** — `.dbc` file association, TextMate grammar, and basic editor integration.
- **CAN Database Editor** — custom editor (structured UI) for opening and editing databases alongside plain-text `.dbc` editing.
- **CAN Database explorer** — activity bar view to browse nodes, messages, signals, and related structure for the active database.
- **DBC model** — parse and serialize DBC text through an internal model (nodes, frames, global signal pool, value tables, attributes).
- **CAN Signal Lab** — webview panel for live monitoring and transmit workflows when a bus connection is available.
- **Bus commands** — connect / disconnect, start / stop monitor, and transmit message (behavior depends on adapter and environment).
- **Adapter selection** — connect flow with **virtual** in-process loopback for development without hardware, and **SocketCAN** as the hardware-oriented path (still evolving).
