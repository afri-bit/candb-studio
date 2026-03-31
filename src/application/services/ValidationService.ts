import type { CanDatabase } from '../../core/models/database/CanDatabase';
import type { IValidationService } from '../../core/interfaces/database/IValidationService';
import type { DiagnosticItem } from '../../core/types';
import { DiagnosticSeverity } from '../../core/types';
import { MAX_STANDARD_CAN_ID, MAX_EXTENDED_CAN_ID, MAX_CAN_DLC } from '../../shared/constants';

/**
 * Validates a CAN database for correctness and consistency.
 * Checks signal ranges, duplicate IDs, DLC bounds, and node references.
 */
export class ValidationService implements IValidationService {
  validate(database: CanDatabase): DiagnosticItem[] {
    const diagnostics: DiagnosticItem[] = [];

    const idsSeen = new Map<number, string>();
    const namesSeen = new Map<string, number>();

    for (let mi = 0; mi < database.messages.length; mi++) {
      const message = database.messages[mi];
      const prefix = `messages[${mi}]`;

      // Duplicate CAN ID
      if (idsSeen.has(message.id)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          message: `Duplicate message ID ${message.idHex}: "${message.name}" conflicts with "${idsSeen.get(message.id)}"`,
          path: prefix,
        });
      }
      idsSeen.set(message.id, message.name);

      // Duplicate name
      if (namesSeen.has(message.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          message: `Duplicate message name "${message.name}"`,
          path: prefix,
        });
      }
      namesSeen.set(message.name, message.id);

      // ID range
      if (message.id < 0 || message.id > MAX_EXTENDED_CAN_ID) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          message: `Message ID ${message.id} is out of valid range [0, ${MAX_EXTENDED_CAN_ID}]`,
          path: `${prefix}.id`,
        });
      } else if (message.id > MAX_STANDARD_CAN_ID) {
        diagnostics.push({
          severity: DiagnosticSeverity.Info,
          message: `Message ID ${message.idHex} is an extended (29-bit) frame ID`,
          path: `${prefix}.id`,
        });
      }

      // DLC
      if (message.dlc < 0 || message.dlc > MAX_CAN_DLC) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          message: `DLC ${message.dlc} is out of range [0, ${MAX_CAN_DLC}]`,
          path: `${prefix}.dlc`,
        });
      }

      // Unknown transmitter node
      if (
        message.transmittingNode &&
        message.transmittingNode !== 'Vector__XXX' &&
        !database.findNodeByName(message.transmittingNode)
      ) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          message: `Message "${message.name}" references unknown transmitter "${message.transmittingNode}"`,
          path: `${prefix}.transmittingNode`,
        });
      }

      // Validate signals (resolved from pool + per-message placement)
      const resolvedSignals = message.getResolvedSignals(database.signalPool, database);
      for (let si = 0; si < resolvedSignals.length; si++) {
        const signal = resolvedSignals[si];
        const sigPrefix = `${prefix}.signals[${si}]`;

        if (signal.bitLength <= 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: `Signal "${signal.name}" has non-positive bitLength (${signal.bitLength})`,
            path: `${sigPrefix}.bitLength`,
          });
        }

        if (signal.startBit < 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: `Signal "${signal.name}" has negative startBit (${signal.startBit})`,
            path: `${sigPrefix}.startBit`,
          });
        }

        const maxBit = message.dlc * 8;
        if (signal.startBit + signal.bitLength > maxBit) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: `Signal "${signal.name}" extends beyond message payload (startBit=${signal.startBit}, bitLength=${signal.bitLength}, maxBit=${maxBit})`,
            path: sigPrefix,
          });
        }

        if (signal.factor === 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            message: `Signal "${signal.name}" has factor=0 (physicalToRaw will produce NaN)`,
            path: `${sigPrefix}.factor`,
          });
        }
      }
    }

    return diagnostics;
  }
}
