import type { CanDatabase } from '../../core/models/database/CanDatabase';

export type VirtualInjectionValidation =
    | { ok: true }
    | { ok: false; message: string; code: string };

/**
 * FR-006: reject unknown messages and DLC mismatch before injecting into the monitor path.
 */
export function validateDbcAlignedInjection(
    canId: number,
    data: Uint8Array,
    database: CanDatabase | null,
): VirtualInjectionValidation {
    if (!database) {
        return {
            ok: false,
            message: 'Load a CAN database before injecting frames.',
            code: 'NO_DATABASE',
        };
    }
    const msg = database.findMessageById(canId);
    if (!msg) {
        return {
            ok: false,
            message: `No message defined for CAN ID 0x${canId.toString(16)}.`,
            code: 'UNKNOWN_MESSAGE',
        };
    }
    if (data.length !== msg.dlc) {
        return {
            ok: false,
            message: `Payload length ${data.length} does not match DLC ${msg.dlc} for message "${msg.name}".`,
            code: 'DLC_MISMATCH',
        };
    }
    return { ok: true };
}
