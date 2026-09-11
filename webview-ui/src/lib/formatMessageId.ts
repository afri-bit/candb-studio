/**
 * CAN message-id helpers for the UI layer.
 *
 * The data layer stores the raw CAN id, where extended (29-bit) frames carry the
 * 0x80000000 marker bit. The UI presents the marker-free id and denotes extended
 * frames with an `x` suffix (standard `0x064`, extended `0x064x`).
 */

/** DBC extended-frame marker bit carried in a raw message id. */
export const CAN_EXTENDED_ID_FLAG = 0x80000000;

/** True if the raw id carries the extended (29-bit) marker bit. */
export function isExtendedId(rawId: number): boolean {
  return (rawId & CAN_EXTENDED_ID_FLAG) !== 0;
}

/** Marker-free arbitration id (the 0x80000000 bit removed). */
export function arbitrationId(rawId: number): number {
  return rawId & 0x7fffffff;
}

/** Combine a marker-free id with a frame format into a raw id. */
export function toRawId(arbId: number, extended: boolean): number {
  return (extended ? (arbId | CAN_EXTENDED_ID_FLAG) : arbId & 0x7fffffff) >>> 0;
}

/**
 * Display form of a raw id: marker-free hex (zero-padded to 3 digits) with an `x`
 * suffix for extended frames — e.g. standard `0x064`, extended `0x064x`.
 */
export function formatMessageId(rawId: number): string {
  const hex = arbitrationId(rawId).toString(16).toUpperCase().padStart(3, '0');
  return `0x${hex}${isExtendedId(rawId) ? 'x' : ''}`;
}

/**
 * Display form of a bus frame id: the id is the marker-free arbitration id and the
 * extended flag is carried separately (as real adapters report). The 0x80000000 bit
 * is stripped defensively — e.g. standard `0x123`, extended `0xCF004FEx`.
 */
export function formatFrameId(id: number, extended: boolean): string {
  const hex = arbitrationId(id).toString(16).toUpperCase().padStart(3, '0');
  return `0x${hex}${extended ? 'x' : ''}`;
}
