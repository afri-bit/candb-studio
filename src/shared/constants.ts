/** Extension identifier. */
export const EXTENSION_ID = 'candb-studio';

/** DBC language identifier for VS Code language features. */
export const DBC_LANGUAGE_ID = 'dbc';

/** Custom editor view type for DBC files (must match `contributes.customEditors[].viewType` in package.json). */
export const DBC_EDITOR_VIEW_TYPE = `${EXTENSION_ID}.canDatabaseEditor`;

/** Tree view ID for the CAN database browser. */
/** Must match `contributes.views` in package.json. */
export const CAN_DATABASE_TREE_VIEW_ID = `${EXTENSION_ID}.canDatabaseExplorer`;

/** Webview view ID for the compact Signal Lab strip in the CANdb Studio sidebar. */
export const SIGNAL_LAB_SIDEBAR_VIEW_ID = `${EXTENSION_ID}.signalLabSidebar`;

/** Maximum standard CAN ID (11-bit). */
export const MAX_STANDARD_CAN_ID = 0x7ff;

/** Maximum extended CAN ID (29-bit). */
export const MAX_EXTENDED_CAN_ID = 0x1fffffff;

/** Maximum CAN frame DLC. */
export const MAX_CAN_DLC = 8;

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
