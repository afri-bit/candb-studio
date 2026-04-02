/** Supported CAN hardware adapter backends. */
export enum AdapterType {
    SocketCAN = 'socketcan',
    SLCAN = 'slcan',
    PCAN = 'pcan',
    Vector = 'vector',
    Virtual = 'virtual',
}
