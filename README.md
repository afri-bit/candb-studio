# CAN Bus Tools

**CAN Bus Tools** is a [Visual Studio Code](https://code.visualstudio.com/) extension for working with **DBC** (CAN database) files: structured editing, exploration in the sidebar, language support in the text editor, and optional bus monitoring and transmission when a compatible adapter is connected.

---

## What this project is

This repository implements **vscode-canbus** (published display name: **CAN Bus Tools**). It bundles:

- A **custom editor** with a Svelte-based UI for viewing and editing CAN databases.
- A **CAN Database** explorer in the activity bar.
- **Syntax highlighting** and language integration for `.dbc` files.
- **Commands** to open databases, connect to a bus, run a monitor, and transmit frames (hardware-dependent).

The extension parses and serializes DBC text through a domain model (nodes, messages, a global signal pool, value tables, and attributes) so edits stay consistent with typical CANdb workflows.

---

## Purpose

Automotive and embedded teams use DBC files to describe CAN frames and signals. This extension aims to make that workflow first-class inside VS Code: open a `.dbc`, understand its structure quickly, edit it safely, and—when you have an adapter—tie the same database to live traffic.

For a deeper view of layers and data flow (persistence, services, webview, optional hardware), see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. The custom editor’s **Architecture** tab also summarizes the stack and can show a live map of nodes and frames for the file you have open.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Visual Studio Code** | Version **1.110** or newer (see `engines.vscode` in `package.json`). |
| **Node.js** | Only needed to **build or develop** the extension (recommended: current LTS). |
| **CAN adapter** | Optional. Connect / monitor / transmit features require supported hardware and drivers; editing and exploration work without a bus. |

---

## Installation

### From a `.vsix` or marketplace (when published)

1. Install the extension in VS Code (Extensions view → search for **CAN Bus Tools**, or install from a `.vsix` via **Install from VSIX…**).
2. Reload the window if prompted.

### From source (development)

```bash
git clone https://github.com/afri-bit/vscode-canbus.git
cd vscode-canbus
npm install
npm install --prefix webview-ui
npm run compile
```

Then launch the **Extension Development Host** from this workspace (F5 in VS Code with the provided launch configuration, if present) or package with `npm run package` and install the generated `.vsix`.

---

## Usage

### Opening and editing a database

- Open any `.dbc` file. Use **Open With…** → **CAN Database Editor** for the structured UI, or edit as plain text with DBC syntax highlighting.
- Use the **CAN Bus Explorer** activity bar view (**CAN Database**) to browse nodes, messages, and signals for the active database context.
- Run commands from the Command Palette (**View → Command Palette**), category **CAN Bus**, for example:
  - **Open CAN Database**
  - **Connect to CAN Bus** / **Disconnect from CAN Bus**
  - **Start CAN Monitor** / **Stop CAN Monitor**
  - **Transmit CAN Message**

Exact behavior of bus-related commands depends on adapter support and your environment.

### Developing the extension

| Command | Description |
|---------|-------------|
| `npm run compile` | Build the webview (`webview-ui`) and bundle the extension with webpack. |
| `npm run watch` | Webpack in watch mode for iterative work; rebuild webview when `webview-ui/` changes. |
| `npm run lint` | ESLint on `src/`. |
| `npm test` | Compiles tests, compile, lint, then runs `vscode-test`. |

---

## Feature overview

| Area | What you get |
|------|----------------|
| **DBC language** | File association for `.dbc`, TextMate grammar, and DBC as a first-class language in the editor. |
| **Custom editor** | Visual, structured editing backed by the same `CanDatabase` model as save/load. |
| **Explorer** | Sidebar tree under **CAN Bus Explorer** for navigating database content. |
| **Bus workflow** *(optional)* | Commands to connect, monitor, and transmit; decoding uses the loaded database when an adapter is available. |
| **Architecture docs** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes services, events, and how `.dbc` flows through the system. |

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for the full text.

Copyright (c) 2026 afri-bit.
