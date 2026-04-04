# Contracts: Virtual CAN Bus (Spec 010)

Extension host ↔ Signal Lab webview messages are the public contract for this feature. **Source of truth in code**: `src/presentation/webview/messages/WebviewMessageTypes.ts` and `ExtensionToWebviewMessage` / `WebviewToExtensionMessage`.

## T001–T002 implementation trace (setup)

- **Additive webview protocol** (implemented in `WebviewMessageTypes.ts`): `virtualBus.start`, `virtualBus.stop`, `virtualBus.inject`, `transmit.sendRaw` (no DBC), extension → webview `signalLab.error`, and `signalLab.context` fields `connectionMode`, `virtualSimulationRunning`.
- **Wiring**: `VirtualBusSimulationService` is constructed in `extension.ts`, registered on `ConnectBusCommand` for exclusive-mode gating, passed into `WebviewMessageHandler` with `ConnectBusCommand` for `virtualBus.*` and virtual periodic routing. `VirtualCanAdapter.injectFrameForMonitor` feeds the same `MonitorService` path as hardware receives.

## Required updates (implementation checklist)

1. **Connection / mode**
   - Extension → webview: include explicit `connectionMode: 'disconnected' | 'virtual_simulation' | 'hardware'` (or equivalent) in the existing Signal Lab state push.
   - Webview: render **Virtual simulation** vs **Hardware** (or **Disconnected**) per FR-005.

2. **Virtual session control** (proposed message shapes — align names with existing `transmit.*` pattern)

   **Webview → Extension** (illustrative; finalize in code):

   - `virtualBus.start` — `{ type: 'virtualBus.start' }`  
   - `virtualBus.stop` — `{ type: 'virtualBus.stop' }`  
   - `virtualBus.inject` — DBC-aligned: `{ type: 'virtualBus.inject'; messageId: number; data: number[] }`  
   - Raw (no DBC): `{ type: 'transmit.sendRaw'; id: number; data: number[]; dlc: number; isExtended?: boolean }`

   **Extension → Webview**:

   - Reuse frame/decoded streams already used for live traffic; user-visible errors:  
     `{ type: 'signalLab.error'; message: string; code?: string }`

3. **Compatibility**

   - Existing `transmit.send` / `transmit.startPeriodic` may map to **hardware** path only, or be **unified** under virtual when mode is simulation—**document** the chosen behavior in PR to avoid dual semantics.

4. **Versioning**

   - Bump or tag webview protocol if breaking; prefer additive fields first.

## Non-goals (this contract)

- No public HTTP API.
- File replay (spec 008) is out of scope unless explicitly combined later.
