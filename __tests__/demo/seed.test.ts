import { describe, expect, it } from "vitest";
import { seedHistory } from "@/lib/demo/seed";
import { buildDashboard } from "@/lib/dashboard";
import { CallStore } from "@/lib/store";

const now = new Date("2026-11-03T15:00:00Z");
const zone = { timeZone: "America/New_York", now };

function seeded(seed = 2026, days = 30) {
  const store = new CallStore(":memory:");
  seedHistory(store, { days, now, seed });
  return store;
}

describe("seedHistory", () => {
  it("is repeatable for a seed", () => {
    const a = buildDashboard(seeded(), { ...zone, days: 30 });
    const b = buildDashboard(seeded(), { ...zone, days: 30 });
    expect(a.totals).toEqual(b.totals);
    expect(a.daily).toEqual(b.daily);
  });

  it("tells a different story for another seed", () => {
    expect(buildDashboard(seeded(1), { ...zone, days: 30 }).totals).not.toEqual(buildDashboard(seeded(2), { ...zone, days: 30 }).totals);
  });

  it("makes a busy month that includes every outcome", () => {
    const { totals } = buildDashboard(seeded(), { ...zone, days: 30 });
    expect(totals.stored).toBeGreaterThan(100);
    expect(totals.duplicates).toBeGreaterThan(0);
    expect(totals.invalid).toBeGreaterThan(0);
    expect(totals.unauthorized).toBeGreaterThan(0);
  });

  it("only uses fictional phone numbers", () => {
    const { calls } = buildDashboard(seeded(), { ...zone, days: 30 });
    expect(calls.every((call) => /^\+1\d{3}55501\d{2}$/.test(call.phone))).toBe(true);
  });

  it("never dates anything in the future", () => {
    const store = seeded();
    expect(store.callsSince("2000-01-01T00:00:00Z", 10_000).every((call) => Date.parse(call.receivedAt) <= now.getTime())).toBe(true);
    expect(store.eventsSince("2000-01-01T00:00:00Z").every((event) => Date.parse(event.at) <= now.getTime())).toBe(true);
  });

  it("is busier on weekdays than weekends", () => {
    const { daily } = buildDashboard(seeded(), { ...zone, days: 30 });
    const weekday = (d: string) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
    const average = (days: typeof daily) => days.reduce((n, d) => n + d.stored, 0) / days.length;
    expect(average(daily.filter((d) => weekday(d.date)))).toBeGreaterThan(average(daily.filter((d) => !weekday(d.date))));
  });

  it("seeds the requested number of days only", () => {
    const store = seeded(2026, 7);
    const oldest = store.callsSince("2000-01-01T00:00:00Z", 10_000).at(-1);
    expect(Date.parse(oldest!.receivedAt)).toBeGreaterThan(now.getTime() - 8 * 86_400_000);
  });
});
