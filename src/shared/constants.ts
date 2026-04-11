/** Extension identifier. */
export const EXTENSION_ID = 'candb-studio';

/** DBC language identifier for VS Code language features. */
export const DBC_LANGUAGE_ID = 'dbc';

/** Custom editor view type for DBC files (must match `contributes.customEditors[].viewType` in package.json). */
export const DBC_EDITOR_VIEW_TYPE = `${EXTENSION_ID}.canDatabaseEditor`;

/** Tree view ID for the CAN database browser. */
/** Must match `contributes.views` in package.json. */
export const CAN_DATABASE_TREE_VIEW_ID = `${EXTENSION_ID}.canDatabaseExplorer`;

/** Tree view ID for the Signal Lab database outline in the CANdb Studio sidebar. */
export const SIGNAL_LAB_SIDEBAR_VIEW_ID = `${EXTENSION_ID}.signalLabSidebar`;

/** Maximum standard CAN ID (11-bit). */
export const MAX_STANDARD_CAN_ID = 0x7ff;

/** Maximum extended CAN ID (29-bit). */
export const MAX_EXTENDED_CAN_ID = 0x1fffffff;

/** Maximum CAN frame DLC (classic CAN). */
export const MAX_CAN_DLC = 8;

/** Maximum CAN FD frame payload in bytes. */
export const MAX_CAN_FD_DLC = 64;

/**
 * Valid CAN FD payload byte counts (canonical values per ISO 11898-1).
 * DLC nibble values 9–15 map to these counts; 0–8 map 1:1.
 */
export const CAN_FD_VALID_LENGTHS = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64,
] as const;

/** Maps CAN FD wire DLC nibble (9–15) to canonical byte count. Values 0–8 pass through unchanged. */
export function fdDlcNibbleToBytes(nibble: number): number {
    const map: Record<number, number> = {
        9: 12,
        10: 16,
        11: 20,
        12: 24,
        13: 32,
        14: 48,
        15: 64,
    };
    return map[nibble] ?? nibble;
}

/** Maps canonical CAN FD byte count to wire DLC nibble. Values 0–8 pass through unchanged. */
export function fdBytesToDlcNibble(bytes: number): number {
    const map: Record<number, number> = {
        12: 9,
        16: 10,
        20: 11,
        24: 12,
        32: 13,
        48: 14,
        64: 15,
    };
    return map[bytes] ?? bytes;
}

/** Default CAN bus bitrate. */
export const DEFAULT_BITRATE = 500000;

/** Command IDs. */
export const Commands = {
    OPEN_DATABASE: `${EXTENSION_ID}.openDatabase`,
    OPEN_SIGNAL_LAB: `${EXTENSION_ID}.openSignalLab`,
    CLOSE_SIGNAL_LAB: `${EXTENSION_ID}.closeSignalLab`,
    CONNECT_BUS: `${EXTENSION_ID}.connectBus`,
    DISCONNECT_BUS: `${EXTENSION_ID}.disconnectBus`,
    START_MONITOR: `${EXTENSION_ID}.startMonitor`,
    STOP_MONITOR: `${EXTENSION_ID}.stopMonitor`,
    TRANSMIT_MESSAGE: `${EXTENSION_ID}.transmitMessage`,
} as const;
