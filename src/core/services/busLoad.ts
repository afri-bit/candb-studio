import type { MessageSchedule } from '../models/database/messageSchedule';

export const CAN_BITRATES = [125000, 250000, 500000, 800000, 1000000] as const;

/** Classical CAN data frame + 3-bit intermission. Conservative stuffing bound, not actual payload stuffing. */
export function classicalFrameBits(
    dlc: number,
    extended: boolean,
): { base: number; worst: number } {
    if (!Number.isInteger(dlc) || dlc < 0 || dlc > 8) {
        throw new Error('Classical CAN payload must be 0–8 bytes');
    }
    const stuffable = (extended ? 54 : 34) + dlc * 8;
    const base = (extended ? 67 : 47) + dlc * 8;
    return { base, worst: base + Math.floor((stuffable - 1) / 4) };
}

export interface LoadMessage {
    key?: string;
    id: number;
    name: string;
    dlc: number;
    isFd: boolean;
    schedule?: MessageSchedule;
}
export interface NetworkLoad {
    network: string;
    baseBitsPerSecond: number;
    worstBitsPerSecond: number;
    framesPerSecond: number;
}
export interface LoadContribution {
    message: string;
    network: string;
    forwarded: boolean;
    frequencyHz: number;
    baseBitsPerSecond: number;
    worstBitsPerSecond: number;
}

/** Trigger estimates are explicit scenario inputs; they are not inferred periodic traffic. */
export function calculateBusLoad(
    messages: LoadMessage[],
    triggerRates: Record<string, number> = {},
) {
    const networks = new Map<string, NetworkLoad>();
    const contributions: LoadContribution[] = [];
    const excluded: string[] = [];
    function add(
        message: string,
        network: string,
        hz: number,
        bits: { base: number; worst: number },
        forwarded: boolean,
    ) {
        const load = networks.get(network) ?? {
            network,
            baseBitsPerSecond: 0,
            worstBitsPerSecond: 0,
            framesPerSecond: 0,
        };
        load.baseBitsPerSecond += hz * bits.base;
        load.worstBitsPerSecond += hz * bits.worst;
        load.framesPerSecond += hz;
        networks.set(network, load);
        contributions.push({
            message,
            network,
            forwarded,
            frequencyHz: hz,
            baseBitsPerSecond: hz * bits.base,
            worstBitsPerSecond: hz * bits.worst,
        });
    }
    for (const m of messages) {
        const s = m.schedule;
        if (m.isFd || !Number.isInteger(m.dlc) || m.dlc < 0 || m.dlc > 8) {
            excluded.push(`${m.name}: CAN FD or invalid Classical CAN payload`);
            continue;
        }
        if (!s || !['cyclic', 'trigger'].includes(s.sendType)) {
            excluded.push(`${m.name}: send type required`);
            continue;
        }
        const hz = s.sendType === 'cyclic' ? 1000 / s.cycleTimeMs : triggerRates[m.key ?? m.id];
        if (!Number.isFinite(hz) || hz <= 0) {
            excluded.push(
                `${m.name}: ${s.sendType === 'cyclic' ? 'positive cycle time required' : 'trigger rate estimate required'}`,
            );
            continue;
        }
        const bits = classicalFrameBits(m.dlc, m.id > 0x7ff);
        add(m.name, s.sourceNetwork || 'Unassigned', hz, bits, false);
        if (s.forwardNetwork) {
            const rate = s.forwardRateMode === 'source' ? hz : s.forwardFrequencyHz;
            if (
                !s.sourceNetwork ||
                !s.forwardNode ||
                s.forwardNetwork === s.sourceNetwork ||
                !Number.isFinite(rate) ||
                rate <= 0 ||
                rate > hz
            ) {
                excluded.push(`${m.name}: invalid forwarding route or rate exceeds source`);
                continue;
            }
            add(m.name, s.forwardNetwork, rate, bits, true);
        }
    }
    return { networks: [...networks.values()], contributions, excluded };
}
