import type { CallStore, DeliveryEvent, Outcome } from "./store";

export const RANGE_DAYS = [7, 14, 30] as const;

const DAY_MS = 86_400_000;
const MAX_TABLE_ROWS = 200;
const FEED_ROWS = 30;

export interface DailyCounts {
  date: string;
  stored: number;
  duplicates: number;
  invalid: number;
  unauthorized: number;
}

export interface DashboardCall {
  id: string;
  call_id: string | null;
  caller_name: string;
  phone: string;
  reason: string;
  requested_time: string;
  received_at: string;
}

export interface DashboardFeedItem {
  id: number;
  at: string;
  outcome: Outcome;
  matched_on: DeliveryEvent["matchedOn"];
  caller_name: string | null;
  reason: string | null;
  requested_time: string | null;
}

export interface DashboardPayload {
  generated_at: string;
  time_zone: string;
  days: number;
  totals: Omit<DailyCounts, "date"> & { last_24h: number };
  daily: DailyCounts[];
  calls: DashboardCall[];
  requested_times: string[];
  feed: DashboardFeedItem[];
}

export type DashboardResponse = DashboardPayload & { demo: boolean };

export function isRange(days: number): days is (typeof RANGE_DAYS)[number] {
  return (RANGE_DAYS as readonly number[]).includes(days);
}

export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
  } catch {
    throw new Error(`unknown time zone: ${timeZone}`);
  }
}

// Days are calendar days in the clinic's timezone, so "today" matches the clinic's clock.
// Aggregation is done here rather than in SQL: fine for an appointment inbox, revisit at real volume.
export function buildDashboard(
  store: CallStore,
  options: { days: number; timeZone: string; now?: Date },
): DashboardPayload {
  const now = options.now ?? new Date();
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: options.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

  const todayKey = dayKey.format(now);
  const keys = Array.from({ length: options.days }, (_, i) => shiftDay(todayKey, i - (options.days - 1)));
  const daily = new Map<string, DailyCounts>(
    keys.map((date) => [date, { date, stored: 0, duplicates: 0, invalid: 0, unauthorized: 0 }]),
  );

  // Query a day wider than the window and let the day keys decide what is inside it.
  const since = new Date(now.getTime() - (options.days + 1) * DAY_MS).toISOString();
  const dayAgo = now.getTime() - DAY_MS;
  const totals = { stored: 0, duplicates: 0, invalid: 0, unauthorized: 0, last_24h: 0 };

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

  const calls = store.callsSince(since).filter((call) => daily.has(dayKey.format(new Date(call.receivedAt))));

  return {
    generated_at: now.toISOString(),
    time_zone: options.timeZone,
    days: options.days,
    totals,
    daily: keys.map((key) => daily.get(key)!),
    calls: calls.slice(0, MAX_TABLE_ROWS).map((call) => ({
      id: call.id,
      call_id: call.callId,
      caller_name: call.callerName,
      phone: call.phone,
      reason: call.reason,
      requested_time: call.requestedTime,
      received_at: call.receivedAt,
    })),
    requested_times: calls.map((call) => call.requestedTime),
    feed: store.recentEvents(FEED_ROWS).map((event) => ({
      id: event.id,
      at: event.at,
      outcome: event.outcome,
      matched_on: event.matchedOn,
      caller_name: event.call?.callerName ?? null,
      reason: event.call?.reason ?? null,
      requested_time: event.call?.requestedTime ?? null,
    })),
  };
}

// Plain date arithmetic on the key, so a 23 or 25 hour day can't skip or repeat a date.
function shiftDay(key: string, delta: number): string {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + delta)).toISOString().slice(0, 10);
}
