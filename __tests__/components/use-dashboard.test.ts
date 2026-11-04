import { describe, expect, it } from "vitest";
import { withFresh } from "@/components/dashboard/use-dashboard";
import type { DashboardResponse } from "@/lib/dashboard";

function response(overrides: { days?: number; feed?: number[]; calls?: string[] } = {}): DashboardResponse {
  return {
    generated_at: "2026-11-03T15:00:00.000Z",
    time_zone: "UTC",
    days: overrides.days ?? 14,
    demo: false,
    totals: { stored: 0, duplicates: 0, invalid: 0, unauthorized: 0, last_24h: 0 },
    daily: [],
    requested_times: [],
    feed: (overrides.feed ?? []).map((id) => ({ id, at: "", outcome: "created", matched_on: null, caller_name: null, reason: null, requested_time: null })),
    calls: (overrides.calls ?? []).map((id) => ({ id, call_id: null, caller_name: "", phone: "", reason: "", requested_time: "", received_at: "" })),
  };
}

describe("withFresh", () => {
  it("marks nothing as new on the first response", () => {
    const snapshot = withFresh(null, response({ feed: [1, 2], calls: ["a"] }));
    expect(snapshot.freshFeed.size).toBe(0);
    expect(snapshot.freshCalls.size).toBe(0);
  });

  it("marks only the items that were not there before", () => {
    const first = withFresh(null, response({ feed: [2, 1], calls: ["a"] }));
    const next = withFresh(first, response({ feed: [4, 3, 2, 1], calls: ["c", "b", "a"] }));
    expect([...next.freshFeed].sort()).toEqual([3, 4]);
    expect([...next.freshCalls].sort()).toEqual(["b", "c"]);
  });

  it("marks nothing when nothing changed", () => {
    const first = withFresh(null, response({ feed: [1], calls: ["a"] }));
    const next = withFresh(first, response({ feed: [1], calls: ["a"] }));
    expect(next.freshFeed.size + next.freshCalls.size).toBe(0);
  });

  it("does not flash everything when the date range changes", () => {
    const first = withFresh(null, response({ days: 7, feed: [1], calls: ["a"] }));
    const next = withFresh(first, response({ days: 30, feed: [1], calls: ["a", "b", "c"] }));
    expect(next.freshCalls.size).toBe(0);
  });

  it("keeps the new data", () => {
    const data = response({ feed: [1] });
    expect(withFresh(null, data).data).toBe(data);
  });
});
