import type { CanDatabase } from '../database/CanDatabase';
import { Message } from '../database/Message';
import type { Signal } from '../database/Signal';
import { CanFrame } from './CanFrame';

/**
 * A CAN frame decoded using a database message definition.
 *
 * Pairs the raw {@link CanFrame} with its matching {@link Message} definition
 * and a map of signal names to their decoded physical values.
 */
export class DecodedMessage {
    public frame: CanFrame;
    public message: Message;
    /** Pool used to resolve {@link Message} signal references (units, scaling, etc.). */
    public signalPool: Signal[];
    /** Full database for value tables / merged VAL_. */
    public database: CanDatabase;
    public signalValues: Map<string, number>;
    public timestamp: number;

    constructor(params: {
        frame: CanFrame;
        message: Message;
        signalPool: Signal[];
        database: CanDatabase;
        signalValues: Map<string, number>;
        timestamp?: number;
    }) {
        this.frame = params.frame;
        this.message = params.message;
        this.signalPool = params.signalPool;
        this.database = params.database;
        this.signalValues = params.signalValues;
        this.timestamp = params.timestamp ?? params.frame.timestamp;
    }

    /** Get the decoded physical value for a named signal, or `undefined` if absent. */
    getSignalValue(signalName: string): number | undefined {
        return this.signalValues.get(signalName);
    }
}
