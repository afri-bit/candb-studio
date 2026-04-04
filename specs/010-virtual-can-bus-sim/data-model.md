# Data Model: Virtual CAN Bus (Spec 010)

## Entities

### VirtualBusSession

| Field | Type | Notes |
|-------|------|--------|
| `id` | string (uuid) | Client-correlatable session id |
| `state` | enum: `idle` \| `running` \| `stopped` | Maps to FR-004 start/stop |
| `mode` | literal `'virtual'` | Always virtual for this spec |
| `startedAt` | number (epoch ms) | Optional analytics |
| `databaseUri` | string \| null | Active DBC context for validation |

### InjectionRequest (DBC-aligned)

| Field | Type | Notes |
|-------|------|--------|
| `messageId` | number | Internal or DBC message key — align with existing transmit messages |
| `payload` | `Uint8Array` \| `number[]` | Raw bytes; validated against message layout |
| `kind` | `'once'` \| `'periodic'` | FR-007 |
| `intervalMs` | number \| undefined | Required if `periodic` |

### InjectionRequestRaw (proposed extension)

| Field | Type | Notes |
|-------|------|--------|
| `canId` | number | 11-bit or 29-bit per `isExtended` |
| `isExtended` | boolean | |
| `dlc` | number | 0–8 classic |
| `data` | `Uint8Array` | Length must match DLC policy |

### ConnectionMode (UI / status)

| Value | Description |
|-------|-------------|
| `disconnected` | No adapter |
| `virtual_simulation` | Spec 010 session active |
| `hardware` | Real adapter (e.g. SocketCAN) |

**Invariant**: At most one of `virtual_simulation` and `hardware` **connected** at a time (per research).

## Validation rules (FR-006)

- Unknown **message** for DBC-aligned injection → error, no silent decode.
- **DLC** / bit-range violations → user-visible error.
- **No database** → block DBC-aligned injection; raw mode may still be allowed if spec amended.

## State transitions

```
idle --start()--> running --stop()--> stopped
stopped --start()--> running
running --stop()--> stopped
```

Clearing session resets periodic timers and pending injections.
