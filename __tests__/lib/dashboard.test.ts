import { describe, expect, it } from "vitest";
import { assertTimeZone, buildDashboard, isRange } from "@/lib/dashboard";
import type { CallSummary } from "@/lib/schema";
import { CallStore, type Outcome } from "@/lib/store";

const now = new Date("2026-11-03T15:00:00Z");
const newYork = { timeZone: "America/New_York", now };

const call = (phone: string, requestedTime = "2026-11-10T14:00:00.000Z"): CallSummary => ({
  callId: null,
  callerName: "Jane Sample",
  phone,
  reason: "Check-up",
  requestedTime,
});

function storeWithEvents(events: Array<[at: string, outcome: Outcome]>) {
  const store = new CallStore(":memory:");
  for (const [at, outcome] of events) store.recordEvent({ at, outcome });
  return store;
}

describe("isRange / assertTimeZone", () => {
  it("accepts only the offered ranges", () => {
    expect([7, 14, 30].every(isRange)).toBe(true);
    expect([0, 1, 5, 15, 365, NaN, -7].some(isRange)).toBe(false);
  });

  it("throws on a timezone the runtime does not know", () => {
    expect(() => assertTimeZone("Mars/Olympus")).toThrow(/unknown time zone/);
    expect(() => assertTimeZone("Europe/Berlin")).not.toThrow();
  });
});

describe("buildDashboard days", () => {
  it.each([7, 14, 30])("returns exactly %i contiguous days ending today", (days) => {
    const { daily } = buildDashboard(new CallStore(":memory:"), { ...newYork, days });
    expect(daily).toHaveLength(days);
    expect(daily.at(-1)?.date).toBe("2026-11-03");
    const steps = daily.slice(1).map((d, i) => (Date.parse(d.date) - Date.parse(daily[i]!.date)) / 86_400_000);
    expect(new Set(steps)).toEqual(new Set([1]));
  });

  it("stays contiguous across the autumn daylight-saving change", () => {
    const { daily } = buildDashboard(new CallStore(":memory:"), { ...newYork, days: 7 });
    expect(daily.map((d) => d.date)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("stays contiguous across the spring daylight-saving change", () => {
    const spring = new Date("2026-03-10T16:00:00Z");
    const { daily } = buildDashboard(new CallStore(":memory:"), { timeZone: "America/New_York", now: spring, days: 7 });
    expect(daily.map((d) => d.date)).toEqual(["2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
  });

  it("crosses a month and a year boundary", () => {
    const newYear = new Date("2027-01-02T12:00:00Z");
    const { daily } = buildDashboard(new CallStore(":memory:"), { timeZone: "UTC", now: newYear, days: 7 });
    expect(daily[0]?.date).toBe("2026-12-27");
    expect(daily.at(-1)?.date).toBe("2027-01-02");
  });

  it("starts every day at zero", () => {
    const { daily, totals } = buildDashboard(new CallStore(":memory:"), { ...newYork, days: 7 });
    expect(daily.every((d) => d.stored + d.duplicates + d.invalid + d.unauthorized === 0)).toBe(true);
    expect(totals).toEqual({ stored: 0, duplicates: 0, invalid: 0, unauthorized: 0, last_24h: 0 });
  });
});

describe("buildDashboard counting", () => {
  it("assigns events to the clinic's day, not the UTC day", () => {
    const store = storeWithEvents([
      ["2026-11-03T03:00:00Z", "created"],
      ["2026-11-03T06:00:00Z", "created"],
    ]);
    const { daily } = buildDashboard(store, { ...newYork, days: 7 });
    expect(daily.find((d) => d.date === "2026-11-02")?.stored).toBe(1);
    expect(daily.find((d) => d.date === "2026-11-03")?.stored).toBe(1);
  });

  it("uses the requested timezone for the same instant", () => {
    const store = storeWithEvents([["2026-11-03T03:00:00Z", "created"]]);
    const tokyo = buildDashboard(store, { timeZone: "Asia/Tokyo", now, days: 7 });
    expect(tokyo.daily.find((d) => d.date === "2026-11-03")?.stored).toBe(1);
    const newYorkDay = buildDashboard(store, { ...newYork, days: 7 });
    expect(newYorkDay.daily.find((d) => d.date === "2026-11-02")?.stored).toBe(1);
  });

  it("handles a half-hour timezone", () => {
    const store = storeWithEvents([["2026-11-02T19:00:00Z", "created"]]);
    const { daily } = buildDashboard(store, { timeZone: "Asia/Kolkata", now, days: 7 });
    expect(daily.find((d) => d.date === "2026-11-03")?.stored).toBe(1);
  });

  it("counts each outcome and the last 24 hours separately", () => {
    const store = storeWithEvents([
      ["2026-11-03T14:00:00Z", "created"],
      ["2026-11-03T13:00:00Z", "created"],
      ["2026-11-02T12:00:00Z", "created"],
      ["2026-11-03T12:00:00Z", "duplicate"],
      ["2026-11-03T11:00:00Z", "invalid"],
      ["2026-11-03T10:00:00Z", "unauthorized"],
    ]);
    expect(buildDashboard(store, { ...newYork, days: 7 }).totals).toEqual({ stored: 3, duplicates: 1, invalid: 1, unauthorized: 1, last_24h: 2 });
  });

  it("includes an event exactly 24 hours old in the last day", () => {
    const store = storeWithEvents([["2026-11-02T15:00:00Z", "created"]]);
    expect(buildDashboard(store, { ...newYork, days: 7 }).totals.last_24h).toBe(1);
  });

  it("ignores events outside the window", () => {
    const store = storeWithEvents([
      ["2026-10-01T12:00:00Z", "created"],
      ["2026-10-10T12:00:00Z", "created"],
      ["2026-10-27T12:00:00Z", "created"],
      ["2026-11-03T12:00:00Z", "created"],
    ]);
    expect(buildDashboard(store, { ...newYork, days: 7 }).totals.stored).toBe(1);
    expect(buildDashboard(store, { ...newYork, days: 30 }).totals.stored).toBe(3);
  });

  it("keeps the daily buckets consistent with the totals", () => {
    const store = storeWithEvents([
      ["2026-11-03T14:00:00Z", "created"],
      ["2026-11-02T14:00:00Z", "duplicate"],
      ["2026-11-01T14:00:00Z", "invalid"],
      ["2026-10-31T14:00:00Z", "unauthorized"],
      ["2026-10-30T14:00:00Z", "created"],
    ]);
    const { daily, totals } = buildDashboard(store, { ...newYork, days: 14 });
    const sum = (key: "stored" | "duplicates" | "invalid" | "unauthorized") => daily.reduce((n, d) => n + d[key], 0);
    expect([sum("stored"), sum("duplicates"), sum("invalid"), sum("unauthorized")]).toEqual([totals.stored, totals.duplicates, totals.invalid, totals.unauthorized]);
  });
});

describe("buildDashboard calls", () => {
  it("scopes calls and requested times to the same window as the counts", () => {
    const store = new CallStore(":memory:");
    store.save(call("+15550100111"), { at: "2026-11-03T14:00:00Z" });
    store.save(call("+15550100112", "2026-11-11T14:00:00.000Z"), { at: "2026-09-01T14:00:00Z" });
    const out = buildDashboard(store, { ...newYork, days: 7 });
    expect(out.calls).toHaveLength(1);
    expect(out.requested_times).toEqual(["2026-11-10T14:00:00.000Z"]);
  });

  it("lists calls newest first with the wire field names", () => {
    const store = new CallStore(":memory:");
    store.save(call("+15550100111"), { at: "2026-11-02T14:00:00Z" });
    store.save(call("+15550100112", "2026-11-11T14:00:00.000Z"), { at: "2026-11-03T14:00:00Z" });
    const { calls } = buildDashboard(store, { ...newYork, days: 7 });
    expect(calls.map((c) => c.phone)).toEqual(["+15550100112", "+15550100111"]);
    expect(Object.keys(calls[0]!).sort()).toEqual(["call_id", "caller_name", "id", "phone", "reason", "received_at", "requested_time"]);
  });

  it("caps the table at 200 rows but still feeds every request to the heatmap", () => {
    const store = new CallStore(":memory:");
    for (let i = 0; i < 230; i++) store.save(call(`+1555${String(i).padStart(7, "0")}`), { at: "2026-11-03T14:00:00Z" });
    const out = buildDashboard(store, { ...newYork, days: 7 });
    expect(out.calls).toHaveLength(200);
    expect(out.requested_times).toHaveLength(230);
  });

  it("returns the 30 most recent events for the feed, newest first", () => {
    const store = new CallStore(":memory:");
    for (let i = 0; i < 40; i++) store.recordEvent({ outcome: "created", at: "2026-11-03T14:00:00Z" });
    const { feed } = buildDashboard(store, { ...newYork, days: 7 });
    expect(feed).toHaveLength(30);
    expect(feed[0]!.id).toBeGreaterThan(feed[29]!.id);
  });

  it("reports when and in which zone it was built", () => {
    const out = buildDashboard(new CallStore(":memory:"), { ...newYork, days: 14 });
    expect(out).toMatchObject({ generated_at: "2026-11-03T15:00:00.000Z", time_zone: "America/New_York", days: 14 });
  });
});
