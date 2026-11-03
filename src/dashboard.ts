import type { CallStore, DeliveryEvent } from "./store.ts";

const DAY_MS = 86_400_000;
const MAX_TABLE_ROWS = 200;
const FEED_ROWS = 30;

export const RANGE_DAYS = [7, 14, 30] as const;

export interface DashboardPayload {
  generated_at: string;
  time_zone: string;
  days: number;
  totals: { stored: number; duplicates: number; invalid: number; unauthorized: number; last_24h: number };
  daily: Array<{ date: string; stored: number; duplicates: number; invalid: number; unauthorized: number }>;
  calls: Array<{
    id: string;
    call_id: string | null;
    caller_name: string;
    phone: string;
    reason: string;
    requested_time: string;
    received_at: string;
  }>;
  /** Every requested time in the window (not just the table's rows), for the weekday x hour heatmap. */
  requested_times: string[];
  feed: Array<{
    id: number;
    at: string;
    outcome: DeliveryEvent["outcome"];
    matched_on: DeliveryEvent["matchedOn"];
    caller_name: string | null;
    reason: string | null;
    requested_time: string | null;
  }>;
}

/**
 * Everything the dashboard shows, in one snapshot so the numbers on screen always agree.
 * Days are business days in `timeZone` (not UTC), so "today" matches the clinic's clock.
 *
 * Aggregation happens here in JS over the window's rows. That is fine for an appointment inbox
 * (a few thousand rows); at much larger volume, push the GROUP BY into SQL.
 */
export function buildDashboard(store: CallStore, opts: { days: number; timeZone: string; now?: Date }): DashboardPayload {
  const now = opts.now ?? new Date();
  const dayKey = dayKeyFormatter(opts.timeZone);

  // The last N calendar days ending today, oldest first, as YYYY-MM-DD in the target timezone.
  // Stepping back is plain date arithmetic on the key, so DST's 23/25-hour days can't skip or repeat one.
  const todayKey = dayKey.format(now);
  const keys = Array.from({ length: opts.days }, (_, i) => shiftDay(todayKey, i - (opts.days - 1)));
  const daily = new Map(keys.map((date) => [date, { date, stored: 0, duplicates: 0, invalid: 0, unauthorized: 0 }]));

  // Fetch one extra day either side of the window, then let the day keys decide what is really inside it.
  const since = new Date(now.getTime() - (opts.days + 1) * DAY_MS).toISOString();
  const totals = { stored: 0, duplicates: 0, invalid: 0, unauthorized: 0, last_24h: 0 };
  const dayAgo = now.getTime() - DAY_MS;

  for (const event of store.eventsSince(since)) {
    const bucket = daily.get(dayKey.format(new Date(event.at)));
    if (!bucket) continue;
    if (event.outcome === "created") {
      bucket.stored++;
      totals.stored++;
      if (Date.parse(event.at) >= dayAgo) totals.last_24h++;
    } else if (event.outcome === "duplicate") {
      bucket.duplicates++;
      totals.duplicates++;
    } else {
      bucket[event.outcome]++;
      totals[event.outcome]++;
    }
  }

  const calls = store.callsSince(since).filter((c) => daily.has(dayKey.format(new Date(c.receivedAt))));

  return {
    generated_at: now.toISOString(),
    time_zone: opts.timeZone,
    days: opts.days,
    totals,
    daily: keys.map((k) => daily.get(k)!),
    calls: calls.slice(0, MAX_TABLE_ROWS).map((c) => ({
      id: c.id,
      call_id: c.callId,
      caller_name: c.callerName,
      phone: c.phone,
      reason: c.reason,
      requested_time: c.requestedTime,
      received_at: c.receivedAt,
    })),
    requested_times: calls.map((c) => c.requestedTime),
    feed: store.recentEvents(FEED_ROWS).map((e) => ({
      id: e.id,
      at: e.at,
      outcome: e.outcome,
      matched_on: e.matchedOn,
      caller_name: e.call?.callerName ?? null,
      reason: e.call?.reason ?? null,
      requested_time: e.call?.requestedTime ?? null,
    })),
  };
}

/** `en-CA` formats dates as YYYY-MM-DD, which sorts and compares as plain text. */
function dayKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
}

function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Throws a clear error for a timezone the runtime doesn't know, instead of failing on the first request. */
export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
  } catch {
    throw new Error(`unknown time zone: ${timeZone}`);
  }
}
