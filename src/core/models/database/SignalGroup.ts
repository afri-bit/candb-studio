/**
 * A logical grouping of signals within a message.
 *
 * Signal groups allow organizing related signals together
 * (e.g. all signals belonging to a particular subsystem).
 * In a DBC file these are declared in the `SIG_GROUP_` section.
 */
export class SignalGroup {
  public messageId: number;
  public name: string;
  public repetitions: number;
  public signalNames: string[];

  constructor(params: {
    messageId: number;
    name: string;
    repetitions?: number;
    signalNames?: string[];
  }) {
    this.messageId = params.messageId;
    this.name = params.name;
    this.repetitions = params.repetitions ?? 1;
    this.signalNames = params.signalNames ?? [];
  }

  addSignal(signalName: string): void {
    if (!this.signalNames.includes(signalName)) {
      this.signalNames.push(signalName);
    }
  }

  removeSignal(signalName: string): boolean {
    const index = this.signalNames.indexOf(signalName);
    if (index === -1) { return false; }
    this.signalNames.splice(index, 1);
    return true;
  }
}
