# Overview: components and layers

The extension host code under `src/` is organized in **layers**. Dependencies point **inward**: presentation and application may use domain and infrastructure; **domain** must not import VS Code APIs.

## Layer map

```mermaid
flowchart TB
    subgraph ext["extension.ts"]
        ACT[activate / deactivate]
    end

    subgraph pres["Presentation"]
        CMD[Commands]
        ED[CanDatabaseEditorProvider]
        WH[WebviewMessageHandler]
        TREE[CanDatabaseTreeProvider]
        LANG[Hover / Completion / Diagnostic]
        LAB[Signal Lab panel + sidebar]
    end

    subgraph app["Application"]
        CDS[CanDatabaseService]
        VAL[ValidationService]
        MON[MonitorService]
        TRX[TransmitService]
    end

    subgraph dom["Domain"]
        CDB[CanDatabase and related models]
    end

    subgraph infra["Infrastructure"]
        REPO[FileSystemRepository]
        PARSE[DbcParser / DbcSerializer]
        DEC[SignalDecoder / SignalEncoder]
        ADP[ICanBusAdapter implementations]
    end

    subgraph cross["Shared"]
        EB[EventBus]
        LOG[Logger]
    end

    ACT --> pres
    ACT --> app
    ACT --> infra
    ACT --> cross

    pres --> app
    app --> dom
    app --> infra
    app --> cross
    MON --> dom
    MON --> DEC
    TRX --> ADP
    REPO --> PARSE
```

## How data crosses boundaries

1. **User opens a `.dbc`** → VS Code loads the document → **CanDatabaseEditorProvider** calls **CanDatabaseService.loadFromTextDocument** (or **OpenDatabaseCommand** uses **load** from disk).
2. **Repository** reads bytes / text → **DbcParser** builds **CanDatabase** → service stores it in a **session map** keyed by document URI and emits **database:loaded** on **EventBus**.
3. **Webview** receives **database.update** JSON from **serializeDatabaseForWebview**; edits post messages back → **WebviewMessageHandler** calls service mutators → **persistEditorDocument** rewrites the text buffer.

## Optional CAN bus path

**ConnectBusCommand** creates an **ICanBusAdapter**. On success, **extension.ts** constructs **MonitorService** and **TransmitService**, injects them into **WebviewMessageHandler** and **CommandRegistrar**, and subscribes monitor decode to the **active bus database** URI from **CanDatabaseService**.

## Next

- [02-extension-entry.md](02-extension-entry.md) — exact wiring in `extension.ts`
- [03-application-layer.md](03-application-layer.md) — what `CanDatabaseService` owns
