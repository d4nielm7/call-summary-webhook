import { getConfig } from "./config";
import { CallStore } from "./store";

// Kept on globalThis so hot reloads in dev don't open a second connection.
const shared = globalThis as typeof globalThis & { callStore?: CallStore };

export function getStore(): CallStore {
  shared.callStore ??= new CallStore(getConfig().databasePath);
  return shared.callStore;
}
