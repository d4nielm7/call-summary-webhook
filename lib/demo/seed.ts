import { parseCallSummary, type CallSummary } from "../schema";
import type { CallStore } from "../store";
import { createRng, duplicateOf, randomCall, type Payload } from "./simulator";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// Goes through the real validator and store, so seeded rows follow the same rules as live ones.
export function seedHistory(store: CallStore, options: { days: number; now: Date; seed: number }): void {
  const { days, now, seed } = options;
  const rng = createRng(seed);
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (let back = days - 1; back >= 0; back--) {
    const midnight = startOfToday - back * DAY_MS;
    const weekend = [0, 6].includes(new Date(midnight + 12 * HOUR_MS).getUTCDay());
    const growth = 0.6 + 0.6 * ((days - back) / days);
    const count = Math.round((weekend ? 2 + rng() * 3 : 7 + rng() * 8) * growth);

    // 13:00 to 22:00 UTC is 08:00 to 17:00 clinic time.
    const times = Array.from({ length: count }, () => midnight + (13 + rng() * 9) * HOUR_MS)
      .filter((time) => time < now.getTime())
      .sort((a, b) => a - b);

    for (const time of times) {
      const at = new Date(time).toISOString();
      const parsed = parseCallSummary(randomCall(rng, new Date(time)));
      if (!parsed.ok) continue;

      const saved = store.save(parsed.value, { at });
      store.recordEvent({ outcome: saved.created ? "created" : "duplicate", callRef: saved.id, at });

      const roll = rng();
      const later = new Date(Math.min(time + (1 + rng() * 4) * 60_000, now.getTime())).toISOString();
      if (roll < 0.2) {
        const again = parseCallSummary(duplicateOf(rng, toPayload(parsed.value)));
        if (!again.ok) continue;
        const replay = store.save(again.value, { at: later });
        if (!replay.created) store.recordEvent({ outcome: "duplicate", callRef: replay.id, matchedOn: replay.matchedOn, at: later });
      } else if (roll < 0.28) {
        store.recordEvent({ outcome: "invalid", at: later });
      } else if (roll < 0.31) {
        store.recordEvent({ outcome: "unauthorized", at: later });
      }
    }
  }
}

function toPayload(call: CallSummary): Payload {
  return {
    ...(call.callId ? { call_id: call.callId } : {}),
    caller_name: call.callerName,
    phone: call.phone,
    reason: call.reason,
    requested_time: call.requestedTime,
  };
}
