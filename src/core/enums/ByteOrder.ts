/**
 * Byte order (endianness) for signal encoding within a CAN frame.
 *
 * In the CAN/DBC world these are historically called "Intel" and "Motorola"
 * format, corresponding to little-endian and big-endian respectively.
 */
export enum ByteOrder {
    /** Intel byte order — least-significant bit first. */
    LittleEndian = 0,
    /** Motorola byte order — most-significant bit first. */
    BigEndian = 1,
}
