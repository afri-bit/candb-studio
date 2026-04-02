/**
 * A raw CAN bus frame as received from or transmitted to hardware.
 *
 * This is the lowest-level representation of CAN traffic — an arbitration
 * ID, a byte payload, and a timestamp. Use a signal decoder to extract
 * meaningful values via the database definitions.
 */
export class CanFrame {
    public id: number;
    public data: Uint8Array;
    public dlc: number;
    public isExtended: boolean;
    public timestamp: number;

    constructor(params: {
        id: number;
        data: Uint8Array;
        dlc?: number;
        isExtended?: boolean;
        timestamp?: number;
    }) {
        this.id = params.id;
        this.data = params.data;
        this.dlc = params.dlc ?? params.data.length;
        this.isExtended = params.isExtended ?? false;
        this.timestamp = params.timestamp ?? 0;
    }

    /** Format the arbitration ID as a hex string (e.g. "0x1A3"). */
    get idHex(): string {
        return `0x${this.id.toString(16).toUpperCase()}`;
    }

    /** Format data bytes as a space-separated hex string (e.g. "DE AD BE EF"). */
    get dataHex(): string {
        return Array.from(this.data)
            .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
            .join(' ');
    }
}
