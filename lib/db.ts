import { getConfig } from "./config";
import { seedSamples } from "./demo/samples";
import { CallStore } from "./store";

// Kept on globalThis so hot reloads in dev don't open a second connection.
const shared = globalThis as typeof globalThis & { callStore?: CallStore };

export function getStore(): CallStore {
  if (!shared.callStore) {
    const { databasePath, demo } = getConfig();
    const store = new CallStore(databasePath);
    if (demo && store.count() === 0) seedSamples(store);
    shared.callStore = store;
  }
  return shared.callStore;
}
