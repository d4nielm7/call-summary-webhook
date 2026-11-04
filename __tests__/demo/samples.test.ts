import { describe, expect, it } from "vitest";
import { SAMPLE_COUNT, seedSamples } from "@/lib/demo/samples";
import { CallStore } from "@/lib/store";

const now = new Date("2026-11-03T15:00:00Z");

describe("seedSamples", () => {
  it("stores a few calls with every field filled in", () => {
    const store = new CallStore(":memory:");
    seedSamples(store, now);
    const calls = store.latest(10);

    expect(calls).toHaveLength(SAMPLE_COUNT);
    for (const call of calls) {
      expect(call.callerName).toBeTruthy();
      expect(call.reason).toBeTruthy();
      expect(call.phone).toMatch(/^\+1\d{3}55501\d{2}$/);
      expect(Date.parse(call.requestedTime)).toBeGreaterThan(now.getTime());
    }
  });

  it("stores the same calls every time, so seeding twice adds nothing", () => {
    const store = new CallStore(":memory:");
    seedSamples(store, now);
    seedSamples(store, now);
    expect(store.count()).toBe(SAMPLE_COUNT);
  });

  it("dates them just before now, in the order they were made", () => {
    const store = new CallStore(":memory:");
    seedSamples(store, now);
    const times = store.latest(10).map((call) => Date.parse(call.receivedAt));
    expect(times.every((time) => time < now.getTime())).toBe(true);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("is something the webhook treats as ordinary stored calls: a repeat is a duplicate", () => {
    const store = new CallStore(":memory:");
    seedSamples(store, now);
    const [first] = store.latest(1);
    expect(store.save({ ...first!, callId: "another" }).created).toBe(false);
  });
});
