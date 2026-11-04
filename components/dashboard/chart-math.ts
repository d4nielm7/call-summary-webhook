import { zonedParts } from "./format";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

export function linePath(points: Array<[x: number, y: number]>): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

// Two end-of-line labels closer than `gap` px are pushed apart evenly so each stays next to its own dot.
export function spreadLabels(a: number, b: number, gap = 15): [number, number] {
  if (Math.abs(a - b) >= gap) return [a, b];
  const mid = (a + b) / 2;
  return a <= b ? [mid - gap / 2, mid + gap / 2] : [mid + gap / 2, mid - gap / 2];
}

// Rows are weekdays Mon..Sun, columns are hours 0..23, in the given timezone.
export function bucketRequests(times: string[], timeZone: string): number[][] {
  const counts = WEEKDAYS.map(() => Array<number>(24).fill(0));
  for (const iso of times) {
    const parts = zonedParts(new Date(iso), timeZone, { weekday: "short", hour: "2-digit", hourCycle: "h23" });
    const row = counts[WEEKDAYS.indexOf(parts.weekday as (typeof WEEKDAYS)[number])];
    if (row) row[Number(parts.hour) % 24]!++;
  }
  return counts;
}

export function heatLevel(value: number, max: number): number {
  return value === 0 ? 0 : Math.min(5, Math.ceil((value / max) * 5));
}

// Always shows at least 8am to 5pm, wider if requests fall outside it.
export function visibleHours(counts: number[][]): number[] {
  const used = counts.flatMap((row) => row.flatMap((value, hour) => (value ? [hour] : [])));
  const first = Math.min(8, ...used);
  const last = Math.max(17, ...used);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

export function busiestSlot(counts: number[][]): { weekday: string; hour: number; value: number } {
  let best = { weekday: WEEKDAYS[0] as string, hour: 0, value: 0 };
  counts.forEach((row, day) =>
    row.forEach((value, hour) => {
      if (value > best.value) best = { weekday: WEEKDAYS[day] ?? "", hour, value };
    }),
  );
  return best;
}
