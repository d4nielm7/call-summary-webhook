import type { DashboardFeedItem } from "@/lib/dashboard";
import type { MatchedOn } from "@/lib/store";

const numbers = new Intl.NumberFormat("en-US");
export const formatNumber = (value: number) => numbers.format(value);

export const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

const formatters = new Map<string, Intl.DateTimeFormat>();

export function zonedParts(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const cacheKey = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = formatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    formatters.set(cacheKey, formatter);
  }
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

export function slotText(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${p.weekday}, ${p.month} ${p.day} · ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

export function dayLabel(dateKey: string, withWeekday = false): string {
  const options: Intl.DateTimeFormatOptions = { timeZone: "UTC", month: "short", day: "numeric", ...(withWeekday ? { weekday: "short" } : {}) };
  return new Intl.DateTimeFormat("en-US", options).format(new Date(`${dateKey}T00:00:00Z`));
}

export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatPhone(phone: string, full: boolean): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  if (us) return full ? `+1 (${us[1]}) ${us[2]}-${us[3]}` : `+1 (•••) •••-${us[3]}`;
  return full ? phone : phone.slice(0, -4).replace(/\d/g, "•") + phone.slice(-4);
}

export const hourLabel = (hour: number) => {
  const h = hour % 24;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
};

export const matchLabel = (matchedOn: MatchedOn | null) => (matchedOn === "call_id" ? "call id" : "phone + time");

export function feedText(item: DashboardFeedItem, timeZone: string): [title: string, detail: string] {
  switch (item.outcome) {
    case "created":
      return [item.caller_name ?? "", `${slotText(item.requested_time ?? "", timeZone)} · ${item.reason}`];
    case "duplicate":
      return [item.caller_name ?? "", `Matched on ${matchLabel(item.matched_on)}`];
    case "invalid":
      return ["Invalid payload", "Failed validation · nothing was stored"];
    case "unauthorized":
      return ["Request refused", "Not signed with the shared secret"];
  }
}

export interface SimulationResponse {
  kind: string;
  status: number;
  result?: { matched_on?: MatchedOn; errors?: Array<{ field: string }> };
}

export function describeSimulation({ kind, result }: SimulationResponse): string {
  switch (kind) {
    case "call":
      return "new call stored";
    case "duplicate":
      return `duplicate caught, matched on ${matchLabel(result?.matched_on ?? null)}; nothing new stored`;
    case "invalid":
      return `rejected: ${(result?.errors ?? []).map((e) => e.field).join(", ")} failed validation`;
    default:
      return "refused: the signature didn't match";
  }
}
