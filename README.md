# CANdb Studio

<div align="center">
  <img src="resources/candb-studio-logo.svg" alt="CANdb Studio logo" width="350" />
</div>

## Introduction

**CANdb Studio** is a [Visual Studio Code](https://code.visualstudio.com/) extension for working with **`.dbc`** (CAN database) files: structured editing, sidebar exploration, language features in the text editor, and optional bus monitoring and transmission when a compatible adapter is connected.

| | |
|--|--|
| **Display name** | CANdb Studio |
| **Package id** | `candb-studio` (Marketplace: `publisher.candb-studio`) |
| **Scope** | CAN and DBC (`.dbc`) workflows. Other buses or formats (e.g. LIN/LDF, FlexRay, ARXML) are not supported. |

> [!IMPORTANT]  
> *Independent project; not affiliated with Vector Informatik or CANdb++.*



<!-- TODO(media): Short GIF or screen recording — open a `.dbc`, switch editor tabs, optional bus strip (e.g. recorded with [Chronicler](https://marketplace.visualstudio.com/items?itemName=arcsine.chronicler)). -->

### What this project is

The repository builds the **`candb-studio`** extension. It includes:

- A **custom editor** (Svelte) for viewing and editing CAN databases.
- A **CAN Database** explorer in the activity bar (**CANdb Studio** container).
- **Syntax highlighting** and language integration for `.dbc` files.
- **Commands** to open databases, connect to a bus, run a monitor, and transmit frames (adapter-dependent).

The extension parses and serializes DBC text through a domain model (nodes, messages, a global signal pool, value tables, and attributes) so edits stay consistent with typical CANdb-style workflows.

### Why This Exists

Modern tooling should meet automotive and embedded engineers where they already work. **Visual Studio Code** is widely used across teams, so this project brings **DBC-first** editing and exploration into that environment instead of treating `.dbc` files as plain text only.

If you work with CAN and DBC, the goal is simple: open a `.dbc`, understand structure quickly, edit safely, and—when hardware is available—use the same database against live traffic.

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Visual Studio Code** | **1.110** or newer (`engines.vscode` in `package.json`). |
| **Node.js** | Only for **building** the extension (recommended: current LTS). |
| **CAN adapter** | Optional. Connect / monitor / transmit need supported hardware and drivers; editing and exploration work without a bus. |

> [!WARNING]  
> Bus features (connect, monitor, transmit) depend on your adapter and environment. They have not been validated across all hardware setups—treat them as **best-effort** until you verify them on your stack.

## Installation

### Marketplace or `.vsix` (when published)

1. In VS Code: **Extensions** → search **CANdb Studio**, or use **Install from VSIX…**.
2. Reload the window if prompted.

### From source

```bash
git clone https://github.com/afri-bit/vscode-canbus.git
cd vscode-canbus

npm install
npm install --prefix webview-ui
npm run compile
```

Open this folder in VS Code and use **Run Extension** (F5), or run `npm run package` and install the generated `.vsix`.

## Usage

### Editing

- Open a `.dbc`. Choose **Open With…** → **CAN Database Editor** for the structured UI, or edit as plain text with DBC highlighting.
- Use the **CANdb Studio** icon in the **activity bar**, then the **CAN Database** view to browse the tree for the active database context.

### Commands

Open the **Command Palette** (**View → Command Palette**). Commands are grouped under **CANdb Studio**, for example:

| Command | Purpose |
|---------|---------|
| **Open CAN Database** | Pick a `.dbc` from disk and load it into the extension |
| **Open CAN Signal Lab** / **Close CAN Signal Lab…** | Open or close the Signal Lab panel |
| **Connect to CAN Bus** / **Disconnect from CAN Bus** | Adapter-dependent connection |
| **Start CAN Monitor** / **Stop CAN Monitor** | Frame logging while connected |
| **Transmit CAN Message** | Send a frame using the loaded database (when supported) |

Exact behavior for bus commands depends on your adapter and drivers.

### Developing the extension

| Command | Description |
|---------|-------------|
| `npm run compile` | Build `webview-ui` (Vite) and bundle the extension (webpack). |
| `npm run watch` | Webpack watch; rebuild the webview when `webview-ui/` changes. |
| `npm run lint` | ESLint on `src/`. |
| `npm test` | Compile tests, full compile, lint, then `vscode-test`. |

## Features

### DBC language

The extension registers the **`dbc`** language for `*.dbc` files and ships a **TextMate grammar** (`syntaxes/dbc.tmLanguage.json`) so keywords, comments, strings, and common DBC constructs get basic syntax coloring in the **text editor**.

- **Activation**: Opening or focusing a `.dbc` file loads the language support.
- **Custom editor**: For the full structured experience, use **CAN Database Editor** (see below); use **Text view** from that editor if you prefer the raw file in the default editor.

<!-- TODO(media): Screenshot — same `.dbc` split: text editor with highlighting vs. custom editor (optional). -->

### CAN Database Visual Editor

Opening a `.dbc` with **CAN Database Editor** loads the **Svelte**-based UI. It stays in sync with the file on disk: edits go through the same **parse → domain model → serialize** path as save operations.

**Layout**

- **Left**: Resizable **database explorer** (version, messages, signals, nodes, attributes, environment variables). Selecting an item jumps to the matching **Messages**, **Signals**, **Nodes**, or **Attributes** tab when relevant.
- **Top tabs**:
  - **Messages** — Frames, DLC, transmitters, linked signals, bit layout navigation.
  - **Signals** — Global signal pool, units, scaling, value tables, links to messages.
  - **Nodes** — ECU / node list and metadata.
  - **Attributes** — Attribute definitions and values where exposed in the UI.
  - **Value tables** — `VAL_TABLE_` / enumerated value editing.
  - **Architecture** — High-level overview (version, nodes, frames) and navigation into detail tabs.
- **Text view** — Opens the same file in the **default text editor** for hand-editing raw DBC.
- **Save** — Writes the serialized database back to the `.dbc` file.

<!-- TODO(media): Screenshot — custom editor with Messages tab and sidebar explorer visible. -->

<!-- TODO(media): Screenshot — Architecture tab (optional second image). -->

### CAN Database Explorer

In the **activity bar**, open **CANdb Studio** → **CAN Database**. This **tree view** shows the **active database for bus decode** — the same session you pick in CAN Signal Lab. If you unlink decode there, the sidebar tree empties until you select another loaded `.dbc`. Top level: **nodes**, **messages** (expand a message for per-frame layout), **signals** (full global pool, A–Z), then **unlinked signals** (pool entries not on any frame).

Use it when you want a compact sidebar overview without opening the full custom editor, or alongside other editors.

<!-- TODO(media): Screenshot — activity bar + CAN Database tree expanded. -->

### CAN Signal Lab

**Signal Lab** combines monitoring, transmit, and charts in one place.

- **Open**: Command **CANdb Studio: Open CAN Signal Lab**, status bar shortcuts where provided, or the full editor-area **CAN Signal Lab** panel.
- **Panels**:
  - **Monitor** — Live frame list when a bus connection and monitor are active; decoding uses the loaded database when a session is attached.
  - **Transmit** — Build and send frames from **message definitions** in the loaded `.dbc` (ID, DLC, signal layout). Requires a loaded database and a working connection path.
  - **Charts** — Signal visualization over time (when data is available).

If no database is attached for decoding, traffic may appear as **raw IDs and payloads** until you load a session / database—see in-UI hints.

<!-- TODO(media): Screenshot — Signal Lab with Monitor tab, connected state (if possible). -->

<!-- TODO(media): Screenshot — Transmit tab with a message selected (optional). -->

### Bus Connection

**Connect to CAN Bus** walks you through choosing an **adapter type** and **channel** (as implemented in the extension). When connected:

- The **status bar** and Signal Lab UI reflect connection state.
- **Start / Stop CAN Monitor** controls frame capture.
- **Transmit CAN Message** sends using your adapter where supported.

Adapter support is **pluggable in code** but **hardware-specific** in practice: install vendor drivers, use a supported channel name, and verify on your machine before relying on it in production.

<!-- TODO(media): Screenshot — status bar connection indicator + Signal Lab hint area (optional). -->

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for ways to help improve the extension.

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Donation

If this extension saves you time, you can support continued development with **[a cup of coffee](https://www.paypal.com/paypalme/afribit)**.

## Credits

Demonstration recordings can be captured with tools such as [Chronicler](https://marketplace.visualstudio.com/items?itemName=arcsine.chronicler).

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE).

Copyright (c) 2026 afri-bit.
