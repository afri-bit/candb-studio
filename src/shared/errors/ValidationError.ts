import { CanBusError } from './CanBusError';

/**
 * Error thrown when CAN database validation fails.
 */
export class ValidationError extends CanBusError {
    constructor(
        message: string,
        public readonly path?: string,
    ) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}
