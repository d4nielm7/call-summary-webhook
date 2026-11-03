import { parseCallSummary } from "./schema.ts";
import { createRng, duplicateOf, randomCall } from "./simulator.ts";
import type { CallStore } from "./store.ts";

const DAY_MS = 86_400_000;

/**
 * Fills a store with believable, entirely fictional history: busier weekdays, a ramp-up toward today,
 * and the retries, mistakes and forged requests a real inbox sees. Deterministic for a given seed.
 * Goes through the real validator and the real store, so the seeded rows obey the same rules as live ones.
 */
export function seedHistory(store: CallStore, opts: { days: number; now: Date; seed: number }): void {
  const rng = createRng(opts.seed);
  const startOfToday = new Date(Date.UTC(opts.now.getUTCFullYear(), opts.now.getUTCMonth(), opts.now.getUTCDate()));

  for (let back = opts.days - 1; back >= 0; back--) {
    const midnight = startOfToday.getTime() - back * DAY_MS;
    const weekend = [0, 6].includes(new Date(midnight + 12 * 3_600_000).getUTCDay());
    // Busier on weekdays, and busier as the receptionist ramps up toward today.
    const growth = 0.6 + 0.6 * ((opts.days - back) / opts.days);
    const count = Math.round((weekend ? 2 + rng() * 3 : 7 + rng() * 8) * growth);

    // 13:00-22:00 UTC is 08:00-17:00 clinic time. Sorted, so rows and events go in chronological order.
    const times = Array.from({ length: count }, () => midnight + (13 + rng() * 9) * 3_600_000)
      .filter((t) => t < opts.now.getTime())
      .sort((a, b) => a - b);

    for (const t of times) {
      const at = new Date(t);
      const parsed = parseCallSummary(randomCall(rng, at));
      if (!parsed.ok) continue;
      const saved = store.save(parsed.value, { at: at.toISOString() });
      store.recordEvent({ outcome: saved.created ? "created" : "duplicate", callRef: saved.id, at: at.toISOString() });

      const roll = rng();
      const later = new Date(Math.min(t + (1 + rng() * 4) * 60_000, opts.now.getTime()));
      if (roll < 0.2) {
        // The platform retried: send the same call (or a re-spoken one) again.
        const again = parseCallSummary(duplicateOf(rng, rawPayload(parsed.value)));
        if (again.ok) {
          const replay = store.save(again.value, { at: later.toISOString() });
          if (!replay.created) store.recordEvent({ outcome: "duplicate", callRef: replay.id, matchedOn: replay.matchedOn, at: later.toISOString() });
        }
      } else if (roll < 0.28) {
        store.recordEvent({ outcome: "invalid", at: later.toISOString() });
      } else if (roll < 0.31) {
        store.recordEvent({ outcome: "unauthorized", at: later.toISOString() });
      }
    }
  }
}

/** Back to the wire format, so a seeded call can be "re-sent". */
function rawPayload(call: { callId: string | null; callerName: string; phone: string; reason: string; requestedTime: string }) {
  return {
    ...(call.callId ? { call_id: call.callId } : {}),
    caller_name: call.callerName,
    phone: call.phone,
    reason: call.reason,
    requested_time: call.requestedTime,
  };
}

