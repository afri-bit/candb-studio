import { ObjectType } from '../../enums/ObjectType';

/**
 * A concrete attribute value assigned to a specific CAN database object.
 *
 * Each attribute references its {@link AttributeDefinition} by name and
 * stores the value for a particular node, message, or signal.
 */
export class Attribute {
    public definitionName: string;
    public objectType: ObjectType;
    public value: string | number;
    /** Node name (for node attributes) or message name (for signal attributes). */
    public objectName?: string;
    /** Message ID — set when objectType is Message or Signal. */
    public messageId?: number;
    /** Signal name — set when objectType is Signal. */
    public signalName?: string;

    constructor(params: {
        definitionName: string;
        objectType: ObjectType;
        value: string | number;
        objectName?: string;
        messageId?: number;
        signalName?: string;
    }) {
        this.definitionName = params.definitionName;
        this.objectType = params.objectType;
        this.value = params.value;
        this.objectName = params.objectName;
        this.messageId = params.messageId;
        this.signalName = params.signalName;
    }
}
