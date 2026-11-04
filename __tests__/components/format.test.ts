import { describe, expect, it } from "vitest";
import {
  dayLabel,
  describeSimulation,
  feedText,
  formatNumber,
  formatPhone,
  hourLabel,
  matchLabel,
  percent,
  slotText,
  timeAgo,
} from "@/components/dashboard/format";
import type { DashboardFeedItem } from "@/lib/dashboard";

describe("formatNumber / percent", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("rounds a share and survives a zero total", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 5)).toBe(100);
    expect(percent(0, 0)).toBe(0);
    expect(percent(7, 0)).toBe(0);
  });
});

describe("slotText", () => {
  it("writes the time in the clinic's timezone", () => {
    expect(slotText("2026-11-10T14:00:00.000Z", "America/New_York")).toBe("Tue, Nov 10 · 9:00 AM");
    expect(slotText("2026-11-10T14:00:00.000Z", "Asia/Tokyo")).toBe("Tue, Nov 10 · 11:00 PM");
  });

  it("rolls the date over with the timezone", () => {
    expect(slotText("2026-11-10T23:30:00.000Z", "Asia/Tokyo")).toBe("Wed, Nov 11 · 8:30 AM");
  });

  it("uses a plain space before AM and PM", () => {
    expect(slotText("2026-11-10T19:15:00.000Z", "America/New_York")).not.toMatch(/ | /);
  });

  it("handles noon and midnight", () => {
    expect(slotText("2026-11-10T17:00:00.000Z", "America/New_York")).toContain("12:00 PM");
    expect(slotText("2026-11-10T05:00:00.000Z", "America/New_York")).toContain("12:00 AM");
  });

  it("follows daylight saving", () => {
    expect(slotText("2026-07-10T13:00:00.000Z", "America/New_York")).toContain("9:00 AM");
    expect(slotText("2026-12-10T14:00:00.000Z", "America/New_York")).toContain("9:00 AM");
  });
});

describe("dayLabel", () => {
  it("formats a date key without shifting it by timezone", () => {
    expect(dayLabel("2026-11-03")).toBe("Nov 3");
    expect(dayLabel("2026-01-01")).toBe("Jan 1");
  });

  it("can include the weekday", () => {
    expect(dayLabel("2026-11-03", true)).toBe("Tue, Nov 3");
  });
});

describe("timeAgo", () => {
  const at = "2026-11-03T12:00:00.000Z";
  const later = (seconds: number) => Date.parse(at) + seconds * 1000;

  it.each([
    [0, "just now"],
    [4, "just now"],
    [5, "5s ago"],
    [59, "59s ago"],
    [60, "1m ago"],
    [3599, "59m ago"],
    [3600, "1h ago"],
    [86_399, "23h ago"],
    [86_400, "1d ago"],
    [3 * 86_400, "3d ago"],
  ])("%is gives %s", (seconds, expected) => {
    expect(timeAgo(at, later(seconds))).toBe(expected);
  });

  it("never goes negative when the clock is behind", () => {
    expect(timeAgo(at, later(-30))).toBe("just now");
  });
});

describe("formatPhone", () => {
  it("masks all but the last four digits by default", () => {
    expect(formatPhone("+15550100123", false)).toBe("+1 (•••) •••-0123");
  });

  it("shows a US number in full when asked", () => {
    expect(formatPhone("+15550100123", true)).toBe("+1 (555) 010-0123");
  });

  it("masks and shows a non-US number", () => {
    expect(formatPhone("+442079460958", false)).toBe("+••••••••0958");
    expect(formatPhone("+442079460958", true)).toBe("+442079460958");
  });

  it("never reveals more than the last four digits when masked", () => {
    expect(formatPhone("+15550100123", false)).not.toMatch(/555|010/);
    expect(formatPhone("+442079460958", false)).not.toMatch(/2079|4609/);
  });
});

describe("hourLabel", () => {
  it.each([
    [0, "12a"],
    [1, "1a"],
    [11, "11a"],
    [12, "12p"],
    [13, "1p"],
    [23, "11p"],
    [24, "12a"],
  ])("%i is %s", (hour, expected) => {
    expect(hourLabel(hour)).toBe(expected);
  });
});

describe("matchLabel", () => {
  it("names how a duplicate was found", () => {
    expect(matchLabel("call_id")).toBe("call id");
    expect(matchLabel("slot")).toBe("phone + time");
    expect(matchLabel(null)).toBe("phone + time");
  });
});

describe("feedText", () => {
  const base: DashboardFeedItem = { id: 1, at: "2026-11-03T12:00:00.000Z", outcome: "created", matched_on: null, caller_name: "Jane Sample", reason: "Check-up", requested_time: "2026-11-10T14:00:00.000Z" };

  it("describes a stored call with its slot and reason", () => {
    expect(feedText(base, "America/New_York")).toEqual(["Jane Sample", "Tue, Nov 10 · 9:00 AM · Check-up"]);
  });

  it("describes a duplicate by how it matched", () => {
    expect(feedText({ ...base, outcome: "duplicate", matched_on: "call_id" }, "UTC")).toEqual(["Jane Sample", "Matched on call id"]);
    expect(feedText({ ...base, outcome: "duplicate", matched_on: "slot" }, "UTC")).toEqual(["Jane Sample", "Matched on phone + time"]);
  });

  it("describes refused deliveries without any caller detail", () => {
    const refused = { ...base, caller_name: null, reason: null, requested_time: null };
    expect(feedText({ ...refused, outcome: "invalid" }, "UTC")).toEqual(["Invalid payload", "Failed validation · nothing was stored"]);
    expect(feedText({ ...refused, outcome: "unauthorized" }, "UTC")).toEqual(["Request refused", "Not signed with the shared secret"]);
  });
});

describe("describeSimulation", () => {
  it("explains each kind of delivery", () => {
    expect(describeSimulation({ kind: "call", status: 201 })).toBe("new call stored");
    expect(describeSimulation({ kind: "duplicate", status: 200, result: { matched_on: "slot" } })).toBe("duplicate caught, matched on phone + time; nothing new stored");
    expect(describeSimulation({ kind: "invalid", status: 422, result: { errors: [{ field: "phone" }, { field: "reason" }] } })).toBe("rejected: phone, reason failed validation");
    expect(describeSimulation({ kind: "unsigned", status: 401 })).toBe("refused: the signature didn't match");
  });
});
