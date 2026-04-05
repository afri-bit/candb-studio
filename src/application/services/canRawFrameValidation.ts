import { MAX_CAN_DLC, MAX_EXTENDED_CAN_ID, MAX_STANDARD_CAN_ID } from '../../shared/constants';

export type RawFrameValidation = { ok: true } | { ok: false; message: string; code: string };

/** Validate classic CAN raw frame before send / virtual inject (no DBC). */
export function validateCanRawFrame(
    id: number,
    data: Uint8Array,
    dlc: number,
    isExtended: boolean,
): RawFrameValidation {
    if (!Number.isInteger(id) || id < 0) {
        return { ok: false, message: 'CAN ID must be a non-negative integer.', code: 'BAD_ID' };
    }
    if (!isExtended && id > MAX_STANDARD_CAN_ID) {
        return {
            ok: false,
            message: `Standard CAN ID must be ≤ 0x${MAX_STANDARD_CAN_ID.toString(16)} (11-bit).`,
            code: 'ID_STANDARD_RANGE',
        };
    }
    if (isExtended && id > MAX_EXTENDED_CAN_ID) {
        return {
            ok: false,
            message: 'Extended CAN ID exceeds 29-bit range.',
            code: 'ID_EXTENDED_RANGE',
        };
    }
    if (!Number.isInteger(dlc) || dlc < 0 || dlc > MAX_CAN_DLC) {
        return {
            ok: false,
            message: `DLC must be between 0 and ${MAX_CAN_DLC} for classic CAN.`,
            code: 'BAD_DLC',
        };
    }
    if (data.length !== dlc) {
        return {
            ok: false,
            message: `Payload length ${data.length} does not match DLC ${dlc}.`,
            code: 'DLC_PAYLOAD',
        };
    }
    return { ok: true };
}
