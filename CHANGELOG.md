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
- **CAN FD support** — first-class CAN FD across the full stack:
  - `Message.isFd` and `CanFrame.isFd / isBrs / isEsi` added as domain fields (backwards-compatible, all default to `false`).
  - Parser derives `isFd` from `VFrameFormat` BA_ attributes (Vector CANdb++ standard); serializer synthesizes `BA_DEF_` and `BA_` lines from `Message.isFd` and filters them from the normal attribute loop to prevent double-emit. Full round-trip supported.
  - DLC validation updated: classic CAN enforces 0–8, CAN FD accepts ISO 11898-1 canonical sizes (0–8, 12, 16, 20, 24, 32, 48, 64) with a warning for non-canonical values and an error above 64.
  - `CanDatabaseService.updateMessage` lifts the hard-coded `Math.min(8, …)` DLC cap for FD messages.
  - Signal codec (encoder and decoder) switches to a BigInt accumulation path for signals wider than 32 bits, enabling correct decoding of wide signals in 64-byte FD payloads.
  - `VirtualCanAdapter` propagates `isFd`, `isBrs`, `isEsi` on loopback frames; `VirtualBusSimulationService` marks injected frames as FD when the message definition is FD.
  - `validateCanFdRawFrame` added to validate raw FD frame submissions (ID range, canonical payload size, DLC/payload length agreement).
  - `CanChannel.dataBitrate` field added; connect flow prompts for CAN FD data bitrate when using SocketCAN.
  - `fdDlcNibbleToBytes` / `fdBytesToDlcNibble` utility functions added to `constants.ts` for future hardware adapter use.
  - `linkSignalToMessage` now rejects signal placements that exceed the message payload (`startBit + bitLength > dlc × 8`).
  - WebviewMessageHandler propagates `isFd` when building `CanFrame` for both single-shot and periodic transmit.
  - Database editor shows a **Frame** column (`CAN` / `FD`) in the message list; message property grid exposes an `isFd` toggle and switches the DLC field to a canonical-size `<select>` when FD is enabled.
  - Signal Lab monitor shows **FD** badge in the DLC column of the raw frame table and in the decoded message view; transmit panel message list shows **FD** badge; raw transmit panel exposes a CAN FD checkbox with BRS toggle and canonical DLC selector.
  - `SocketCanAdapter` comment block documents `CAN_RAW_FD_FRAMES` socket option, `canfd_frame` struct layout, and BRS/ESI flag mapping for when the backend is implemented.

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
