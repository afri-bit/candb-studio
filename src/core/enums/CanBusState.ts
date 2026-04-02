/** Connection state of a CAN bus adapter. */
export enum CanBusState {
    Disconnected = 'disconnected',
    Connecting = 'connecting',
    Connected = 'connected',
    BusOff = 'bus_off',
    Error = 'error',
}
