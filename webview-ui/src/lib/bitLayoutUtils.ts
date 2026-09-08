/**
 * DBC bit map analysis. Bit occupancy is byte-order aware: Intel signals occupy a
 * linear span, Motorola signals follow the Vector CANdb++ sawtooth (see
 * {@link signalPhysicalBits}).
 *
 * Implementation lives in `src/core/layout/bitOccupancy.ts` so mocha unit tests
 * can import it without loading the ESM webview package.
 */
export {
  analyzeMessageLayout,
  getSignalLsbMsbPhysicalBits,
  signalPhysicalBits,
} from '@bit-occupancy';
export type {
  BitCellAnalysis,
  LayoutIssue,
  MessageLayoutAnalysis,
} from '@bit-occupancy';
