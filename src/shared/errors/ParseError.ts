import { CanBusError } from './CanBusError';

/**
 * Error thrown during DBC file parsing.
 */
export class ParseError extends CanBusError {
    constructor(
        message: string,
        public readonly line?: number,
        public readonly column?: number,
    ) {
        super(message, 'PARSE_ERROR');
        this.name = 'ParseError';
    }
}
