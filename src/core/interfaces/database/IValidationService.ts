import { CanDatabase } from '../../models/database/CanDatabase';
import type { DiagnosticItem } from '../../types';

/**
 * Validates a {@link CanDatabase} and returns all diagnostic findings.
 *
 * Validation rules include: overlapping signal bit ranges, signals exceeding
 * message DLC, duplicate IDs/names, and attribute values outside their
 * defined ranges.
 */
export interface IValidationService {
    /** Run all validation rules and return any issues found. */
    validate(database: CanDatabase): DiagnosticItem[];
}
