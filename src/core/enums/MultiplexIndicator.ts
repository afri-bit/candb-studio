/** Multiplexing role of a signal within a CAN message. */
export enum MultiplexIndicator {
  /** Regular (non-multiplexed) signal. */
  None = 'none',
  /** This signal is the multiplexor (switch) that selects which group is active. */
  Multiplexor = 'multiplexor',
  /** This signal is only present when the multiplexor matches a specific value. */
  MultiplexedSignal = 'multiplexed',
}
