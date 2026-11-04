import { describe, expect, it } from "vitest";
import { bucketRequests, busiestSlot, heatLevel, linePath, niceStep, spreadLabels, visibleHours, WEEKDAYS } from "@/components/dashboard/chart-math";

describe("niceStep", () => {
  it.each([
    [0.8, 1],
    [1, 1],
    [1.2, 2],
    [2, 2],
    [2.5, 5],
    [5, 5],
    [6, 10],
    [7.5, 10],
    [12, 20],
    [23, 50],
    [180, 200],
    [4000, 5000],
  ])("rounds %d up to %d", (raw, expected) => {
    expect(niceStep(raw)).toBe(expected);
  });

  it("never returns less than the input", () => {
    for (let raw = 1; raw < 5000; raw += 7) expect(niceStep(raw)).toBeGreaterThanOrEqual(raw);
  });
});

describe("linePath", () => {
  it("starts with a move and continues with lines", () => {
    expect(linePath([[0, 10], [5.55, 20.04], [10, 0]])).toBe("M0.0,10.0L5.5,20.0L10.0,0.0");
  });

  it("is empty for no points", () => {
    expect(linePath([])).toBe("");
  });
});

describe("spreadLabels", () => {
  it("leaves labels that are far enough apart", () => {
    expect(spreadLabels(10, 100)).toEqual([10, 100]);
    expect(spreadLabels(100, 10)).toEqual([100, 10]);
  });

  it("pushes close labels apart evenly around their midpoint", () => {
    expect(spreadLabels(50, 54, 15)).toEqual([44.5, 59.5]);
  });

  it("keeps the order of the labels", () => {
    const [upper, lower] = spreadLabels(54, 50, 15);
    expect(upper).toBeGreaterThan(lower);
  });

  it("separates two labels on the same spot", () => {
    const [a, b] = spreadLabels(80, 80, 15);
    expect(Math.abs(a - b)).toBe(15);
    expect((a + b) / 2).toBe(80);
  });
});

describe("bucketRequests", () => {
  it("has a row per weekday and a column per hour", () => {
    const counts = bucketRequests([], "UTC");
    expect(counts).toHaveLength(7);
    expect(counts.every((row) => row.length === 24 && row.every((n) => n === 0))).toBe(true);
  });

  it("puts a request on the weekday and hour of the clinic's clock", () => {
    const counts = bucketRequests(["2026-11-10T14:00:00.000Z"], "America/New_York");
    expect(counts[WEEKDAYS.indexOf("Tue")]?.[9]).toBe(1);
  });

  it("gives another weekday and hour in another timezone for the same instant", () => {
    const instant = "2026-11-10T23:30:00.000Z";
    expect(bucketRequests([instant], "UTC")[WEEKDAYS.indexOf("Tue")]?.[23]).toBe(1);
    expect(bucketRequests([instant], "Asia/Tokyo")[WEEKDAYS.indexOf("Wed")]?.[8]).toBe(1);
  });

  it("counts midnight as hour 0, not 24", () => {
    const counts = bucketRequests(["2026-11-10T05:00:00.000Z"], "America/New_York");
    expect(counts[WEEKDAYS.indexOf("Tue")]?.[0]).toBe(1);
  });

  it("adds up requests in the same slot and keeps the total", () => {
    const times = ["2026-11-10T14:00:00Z", "2026-11-10T14:30:00Z", "2026-11-17T14:00:00Z", "2026-11-11T14:00:00Z"];
    const counts = bucketRequests(times, "America/New_York");
    expect(counts[WEEKDAYS.indexOf("Tue")]?.[9]).toBe(3);
    expect(counts.flat().reduce((a, b) => a + b, 0)).toBe(4);
  });
});

describe("heatLevel", () => {
  it("is zero only for an empty cell", () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 1000)).toBe(1);
  });

  it("goes from 1 to 5 as the count approaches the busiest cell", () => {
    expect([1, 3, 5, 7, 10].map((v) => heatLevel(v, 10))).toEqual([1, 2, 3, 4, 5]);
  });

  it("never goes above 5", () => {
    expect(heatLevel(20, 10)).toBe(5);
  });
});

describe("visibleHours", () => {
  const empty = () => WEEKDAYS.map(() => Array<number>(24).fill(0));

  it("shows 8am to 5pm at least", () => {
    const hours = visibleHours(empty());
    expect(hours[0]).toBe(8);
    expect(hours.at(-1)).toBe(17);
    expect(hours).toHaveLength(10);
  });

  it("widens to include early and late requests", () => {
    const counts = empty();
    counts[0]![6] = 1;
    counts[2]![20] = 2;
    const hours = visibleHours(counts);
    expect(hours[0]).toBe(6);
    expect(hours.at(-1)).toBe(20);
  });

  it("does not widen for requests inside the default range", () => {
    const counts = empty();
    counts[1]![12] = 3;
    expect(visibleHours(counts)).toHaveLength(10);
  });
});

describe("busiestSlot", () => {
  it("finds the cell with the most requests", () => {
    const counts = WEEKDAYS.map(() => Array<number>(24).fill(0));
    counts[3]![14] = 9;
    counts[1]![9] = 4;
    expect(busiestSlot(counts)).toEqual({ weekday: "Thu", hour: 14, value: 9 });
  });

  it("takes the first cell on a tie", () => {
    const counts = WEEKDAYS.map(() => Array<number>(24).fill(0));
    counts[0]![9] = 5;
    counts[4]![9] = 5;
    expect(busiestSlot(counts).weekday).toBe("Mon");
  });
});
