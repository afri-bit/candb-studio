/**
 * Base error class for all CAN bus extension errors.
 */
export class CanBusError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
    ) {
        super(message);
        this.name = 'CanBusError';
    }
}
