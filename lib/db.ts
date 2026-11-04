import { getConfig } from "./config";
import { seedHistory } from "./demo/seed";
import { CallStore } from "./store";

// Kept on globalThis so hot reloads in dev don't open a second connection.
const shared = globalThis as typeof globalThis & { callStore?: CallStore };

export function getStore(): CallStore {
  if (!shared.callStore) {
    const config = getConfig();
    const store = new CallStore(config.databasePath);
    if (config.demo && store.count() === 0) seedHistory(store, { days: 30, now: new Date(), seed: 2026 });
    shared.callStore = store;
  }
  return shared.callStore;
}
