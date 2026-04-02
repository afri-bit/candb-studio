# CANdb Studio architecture

High-level view of how the **candb-studio** extension is structured: **persistence**, **domain**, **application services**, **presentation** (custom editor, webview, tree, language features), and **optional hardware** (monitor / transmit).

## Layered overview

```mermaid
flowchart TB
    subgraph user[User]
        DBC[".dbc file"]
        UI[VS Code UI]
    end

    subgraph presentation[Presentation]
        CE[CanDatabaseEditorProvider]
        WH[WebviewMessageHandler]
        TV[CanDatabaseTreeProvider]
        LP[Language providers]
    end

    subgraph application[Application]
        CDS[CanDatabaseService]
        VS[ValidationService]
        MS[MonitorService]
        TS[TransmitService]
    end

    subgraph domain[Domain]
        CDB[(CanDatabase)]
        PARSER[DbcParser / DbcSerializer]
    end

    subgraph infra[Infrastructure]
        FS[FileSystemRepository]
        DEC[SignalDecoder]
    end

    subgraph bus[Optional bus]
        ADAPTER[CAN adapter]
    end

    DBC <--> FS
    UI --> CE
    CE --> WH
    CE --> CDS
    WH --> CDS
    TV --> CDS
    LP --> CDS
    CDS --> CDB
    CDS --> PARSER
    CDS --> FS
    MS --> DEC
    MS --> CDB
    TS --> ADAPTER
    CDS --- VS
    EB[(EventBus)] --- CDS
    EB --- MS
```

- **CanDatabase** is the in-memory aggregate: nodes, messages, global **signal pool**, value tables, attributes, etc.
- **CanDatabaseService** loads/saves `.dbc`, applies edits from the webview, and emits **database:loaded** / **database:changed** on the **EventBus**.
- **Custom editor** hosts a **Svelte webview** for structured editing; the same database is shown in the **sidebar tree** and used by **hover / completion / diagnostics** where applicable.
- **MonitorService** / **TransmitService** are wired only after a **bus adapter** connects; they use **SignalDecoder** and the current database for decode (and future encode paths).

## Data flow: open and edit a database

```mermaid
sequenceDiagram
    participant V as VS Code
    participant R as FileSystemRepository
    participant S as CanDatabaseService
    participant E as Custom editor + webview
    participant P as DbcParser

    V->>R: read .dbc
    R->>P: parse text
    P->>S: CanDatabase
    S->>E: serialize + postMessage
    E->>E: user edits
    E->>S: updateMessage / updatePoolSignal / ...
    S->>R: write .dbc (serialize)
```

## Signal pool vs message frames

DBC signals are stored in a **global pool** (unique names). Each **message** references pool signals by name with per-frame placement (start bit, endianness, etc.). Signals that exist only in the pool and are **not linked to any message** are **unlinked** (sometimes called dangling): they round-trip in a DBC extension block until assigned or removed.

```mermaid
flowchart LR
    subgraph pool[Signal pool]
        S1[Signal A]
        S2[Signal B]
    end

    subgraph msg[Message M]
        R1[ref → A]
    end

    S2 -.->|not referenced| X[Unlinked]
    S1 --> R1
```

The **CAN Database** sidebar tree lists **Unlinked signals** separately, with a warning affordance so they are easy to spot.

## Where to look in the repo

| Area | Typical location |
|------|------------------|
| Domain models | `src/core/models/database/` |
| DBC parse/serialize | `src/infrastructure/parsers/dbc/` |
| Load/save, edits | `src/application/services/CanDatabaseService.ts` |
| Webview protocol + serialization | `src/presentation/webview/` |
| Custom editor | `src/presentation/editors/CanDatabaseEditorProvider.ts` |
| Sidebar tree | `src/presentation/views/treeview/` |
| Webview UI | `webview-ui/src/` |
| Signal Lab webview | `webview-ui/signal-lab.html`, `SignalLabApp.svelte` |

In the **DBC custom editor**, the **Architecture** tab (`ArchitectureView.svelte`) shows the same layered extension overview plus a **live network map**: every **BU_** node from the loaded file, with messages grouped by **transmitter**, plus frames whose transmitter is missing or not in the node list.

## Signal Lab (singleton webview)

**Signal Lab** is the instrumentation surface: live frames, decoded signals, and transmit. It is separate from the **CAN Database Editor** webview, which is for authoring the DBC (messages, signals, nodes, value tables, attributes). One Signal Lab panel is opened via the status bar or Command Palette; a second invocation reveals the existing panel.

**Active database for the bus**: `CanDatabaseService` tracks which loaded session (`TextDocument` URI) decodes traffic and fills the transmit message list. The user selects this in Signal Lab; `MonitorService` uses `getDatabaseForBus()` after connect and when the active URI changes.

Bus traffic is posted to the Signal Lab webview only (not broadcast to every custom editor), to avoid duplicate work when multiple `.dbc` tabs are open.

### Signal Lab graphs

Charts are implemented in the **Signal Lab** webview **Charts** tab:

- **Data**: The same decoded traffic as Monitor (`monitor.frame` → `DecodedFrameDescriptor`). The webview keeps **ring buffers per selected signal** (Unix ms on X, physical value on Y), keyed by `${frameId}:${signalName}`, with a **fixed cap** per series (`MAX_CHART_POINTS` in `signalChartStore`) so memory stays bounded. Ingestion runs only for **checked** signals (not for every decoded field).
- **UI throttle**: Chart redraws are driven by a **revision counter** throttled to ~**20 Hz** (50 ms interval), not on every frame, so the UI stays smooth under high bus rates.
- **Library**: **[uPlot](https://github.com/leeoniya/uPlot)** (canvas, small bundle) in the Signal Lab build; CSS is pulled in via `signal-lab-main.ts`. One uPlot instance per selected signal (stacked cards).
- **Tab visibility**: When the **Charts** tab is not active, **append to ring buffers is paused** to save CPU on high-rate traffic; switching back shows new data only after frames arrive again.
- **Optional later**: If profiling shows pressure, aggregate samples in `MonitorService` before sending to the webview.

Diagrams in this file use [Mermaid](https://mermaid.js.org/); they render on GitHub and in many Markdown preview tools.
