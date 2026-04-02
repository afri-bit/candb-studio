import { CanBusError } from './CanBusError';

/**
 * Error thrown when CAN bus hardware connection fails.
 */
export class ConnectionError extends CanBusError {
    constructor(
        message: string,
        public readonly adapterType?: string,
    ) {
        super(message, 'CONNECTION_ERROR');
        this.name = 'ConnectionError';
    }
}
