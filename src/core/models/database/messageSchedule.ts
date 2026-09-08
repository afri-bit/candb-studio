import { AttributeValueType } from '../../enums/AttributeValueType';
import { ObjectType } from '../../enums/ObjectType';
import { Attribute } from './Attribute';
import { AttributeDefinition } from './AttributeDefinition';
import type { CanDatabase } from './CanDatabase';

export interface MessageSchedule {
    sendType: '' | 'cyclic' | 'trigger';
    cycleTimeMs: number;
    sourceNetwork: string;
    forwardNetwork: string;
    forwardNode: string;
    forwardRateMode: 'source' | 'derated';
    forwardFrequencyHz: number;
}

const fields = {
    sendType: 'GenMsgSendType',
    cycleTimeMs: 'GenMsgCycleTime',
    sourceNetwork: 'LHRSourceNetwork',
    forwardNetwork: 'LHRForwardNetwork',
    forwardNode: 'LHRForwardNode',
    forwardRateMode: 'LHRForwardRateMode',
    forwardFrequencyHz: 'LHRForwardFrequencyHz',
} as const;

/** Required schema is installed on load; missing schedules stay visibly unconfigured. */
export function ensureScheduleDefinitions(db: CanDatabase): void {
    for (const [key, name] of Object.entries(fields)) {
        if (db.attributeDefinitions.some((d) => d.name === name)) {
            continue;
        }
        const enumValues =
            key === 'sendType'
                ? ['Unspecified', 'Cyclic', 'Trigger']
                : key === 'forwardRateMode'
                  ? ['Source', 'Derated']
                  : undefined;
        const numeric = key === 'cycleTimeMs' || key === 'forwardFrequencyHz';
        db.attributeDefinitions.push(
            new AttributeDefinition({
                name,
                objectType: ObjectType.Message,
                valueType: enumValues
                    ? AttributeValueType.Enum
                    : numeric
                      ? AttributeValueType.Float
                      : AttributeValueType.String,
                enumValues,
                minimum: numeric ? 0 : undefined,
                maximum: numeric ? 1e12 : undefined,
                defaultValue: enumValues ? enumValues[0] : numeric ? 0 : '',
            }),
        );
    }
}

function read(db: CanDatabase, id: number, name: string): string | number | undefined {
    const def = db.attributeDefinitions.find(
        (d) => d.name === name && d.objectType === ObjectType.Message,
    );
    const value =
        db.attributes.find(
            (a) =>
                a.definitionName === name &&
                a.objectType === ObjectType.Message &&
                a.messageId === id,
        )?.value ?? def?.defaultValue;
    return def?.isEnum && typeof value === 'number' ? def.enumValues?.[value] : value;
}

export function readMessageSchedule(db: CanDatabase, id: number): MessageSchedule {
    const send = String(read(db, id, fields.sendType) ?? '').toLowerCase();
    return {
        sendType:
            send === 'cyclic' ? 'cyclic' : ['trigger', 'triggered'].includes(send) ? 'trigger' : '',
        cycleTimeMs: Number(read(db, id, fields.cycleTimeMs) ?? 0),
        sourceNetwork: String(read(db, id, fields.sourceNetwork) ?? '').trim(),
        forwardNetwork: String(read(db, id, fields.forwardNetwork) ?? '').trim(),
        forwardNode: String(read(db, id, fields.forwardNode) ?? '').trim(),
        forwardRateMode:
            String(read(db, id, fields.forwardRateMode) ?? '').toLowerCase() === 'derated'
                ? 'derated'
                : 'source',
        forwardFrequencyHz: Number(read(db, id, fields.forwardFrequencyHz) ?? 0),
    };
}

export function scheduleErrors(s: MessageSchedule): string[] {
    const errors: string[] = [];
    if (!['cyclic', 'trigger'].includes(s.sendType)) {
        errors.push('Send type is required: choose cyclic or trigger.');
    }
    if (s.sendType === 'cyclic' && !(Number.isFinite(s.cycleTimeMs) && s.cycleTimeMs > 0)) {
        errors.push('Cyclic messages require a positive cycle time.');
    }
    if (s.forwardNetwork) {
        if (!s.sourceNetwork) {
            errors.push('Forwarded messages require a source network.');
        }
        if (s.forwardNetwork === s.sourceNetwork) {
            errors.push('Forwarding destination must differ from source network.');
        }
        if (!s.forwardNode) {
            errors.push('Forwarded messages require a forwarding node.');
        }
        if (s.forwardRateMode === 'derated') {
            if (!(Number.isFinite(s.forwardFrequencyHz) && s.forwardFrequencyHz > 0)) {
                errors.push('Derated forwarding requires a positive frequency.');
            } else if (
                s.sendType === 'cyclic' &&
                s.cycleTimeMs > 0 &&
                s.forwardFrequencyHz > 1000 / s.cycleTimeMs
            ) {
                errors.push('Derated forwarding frequency cannot exceed the source frequency.');
            }
        }
    }
    return errors;
}

/** Apply a complete schedule atomically, preserving existing enum ordering. */
export function writeMessageSchedule(db: CanDatabase, id: number, input: unknown): void {
    if (!input || typeof input !== 'object') {
        throw new Error('Invalid message schedule');
    }
    const s = input as MessageSchedule;
    for (const key of ['sourceNetwork', 'forwardNetwork', 'forwardNode'] as const) {
        if (typeof s[key] !== 'string') {
            throw new Error(`Invalid ${key}`);
        }
    }
    if (s.forwardRateMode !== 'source' && s.forwardRateMode !== 'derated') {
        throw new Error('Invalid forwarding rate mode');
    }
    const clean = {
        ...s,
        sourceNetwork: s.sourceNetwork.trim(),
        forwardNetwork: s.forwardNetwork.trim(),
        forwardNode: s.forwardNode.trim(),
    };
    const errors = scheduleErrors(clean);
    if (errors.length) {
        throw new Error(errors.join(' '));
    }
    ensureScheduleDefinitions(db);
    const pending: Attribute[] = [];
    for (const [key, name] of Object.entries(fields)) {
        const def = db.attributeDefinitions.find((d) => d.name === name)!;
        let value: string | number = clean[key as keyof MessageSchedule];
        if (def.objectType !== ObjectType.Message) {
            throw new Error(`${name} must be a message attribute`);
        }
        if (def.isEnum) {
            const label = String(value).toLowerCase();
            value = def.enumValues!.findIndex(
                (v) =>
                    v.toLowerCase() === label ||
                    (label === 'trigger' && v.toLowerCase() === 'triggered'),
            );
            if (value < 0) {
                throw new Error(`${name} enum must contain ${label}`);
            }
        } else if (
            def.valueType === AttributeValueType.Integer ||
            def.valueType === AttributeValueType.Float
        ) {
            if (
                typeof value !== 'number' ||
                !Number.isFinite(value) ||
                value < 0 ||
                (def.valueType === AttributeValueType.Integer && !Number.isInteger(value))
            ) {
                throw new Error(`${name} requires a valid ${def.valueType} value`);
            }
            if (
                (def.minimum !== undefined && value < def.minimum) ||
                (def.maximum !== undefined && value > def.maximum)
            ) {
                throw new Error(`${name} is outside its attribute range`);
            }
        } else if (def.valueType !== AttributeValueType.String) {
            throw new Error(`Unsupported attribute type for ${name}`);
        }
        pending.push(
            new Attribute({
                definitionName: name,
                objectType: ObjectType.Message,
                messageId: id,
                value,
            }),
        );
    }
    db.attributes = db.attributes.filter(
        (a) =>
            !(
                a.objectType === ObjectType.Message &&
                a.messageId === id &&
                Object.values(fields).includes(
                    a.definitionName as (typeof fields)[keyof typeof fields],
                )
            ),
    );
    db.attributes.push(...pending);
}
