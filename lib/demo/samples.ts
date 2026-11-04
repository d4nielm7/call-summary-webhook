import { parseCallSummary } from "../schema";
import type { CallStore } from "../store";
import { createRng, randomCall } from "./simulator";

export const SAMPLE_COUNT = 4;

// A few made-up calls so a fresh demo isn't an empty page. They go through the real validator and store,
// and the same seed always gives the same calls, so seeding twice stores them once.
export function seedSamples(store: CallStore, now = new Date()): void {
  const rng = createRng(2026);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const parsed = parseCallSummary(randomCall(rng, now));
    if (parsed.ok) store.save(parsed.value, { at: new Date(now.getTime() - (SAMPLE_COUNT - i) * 60_000).toISOString() });
  }
}
