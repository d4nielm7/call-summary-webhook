import { getConfig } from "../config";
import { getStore } from "../db";
import { deliverToWebhook, Simulator, toPayload } from "./simulator";

const shared = globalThis as typeof globalThis & { simulator?: Simulator };

export function getSimulator(): Simulator {
  if (!shared.simulator) {
    const store = getStore();
    const { secret } = getConfig();
    shared.simulator = new Simulator({
      secret,
      deliver: deliverToWebhook({ store, secret }),
      latest: () => {
        const [call] = store.latest(1);
        return call && toPayload(call);
      },
    });
  }
  return shared.simulator;
}
