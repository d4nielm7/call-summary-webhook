import { getConfig } from "../config";
import { getStore } from "../db";
import { deliverToWebhook, Simulator } from "./simulator";

const shared = globalThis as typeof globalThis & { simulator?: Simulator; liveTimer?: NodeJS.Timeout };

export function getSimulator(): Simulator {
  if (!shared.simulator) {
    const { secret } = getConfig();
    shared.simulator = new Simulator({ secret, deliver: deliverToWebhook({ store: getStore(), secret }) });
  }
  return shared.simulator;
}

export function startLiveSimulation(): void {
  if (shared.liveTimer) return;

  const tick = () => {
    const simulator = getSimulator();
    simulator
      .send(simulator.nextKind())
      .catch(() => {})
      .finally(() => {
        shared.liveTimer = setTimeout(tick, 2500 + Math.random() * 3500);
      });
  };
  shared.liveTimer = setTimeout(tick, 2000);
}
