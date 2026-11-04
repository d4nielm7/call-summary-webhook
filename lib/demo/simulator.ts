import { handleCallSummary, type WebhookDeps } from "../handlers/call-summary";
import type { CallSummary } from "../schema";
import { sign, SIGNATURE_HEADER } from "../signature";

export type Rng = () => number;
export type DeliveryKind = "call" | "duplicate" | "invalid" | "unsigned";
export const DELIVERY_KINDS: readonly DeliveryKind[] = ["call", "duplicate", "invalid", "unsigned"];

export interface Payload {
  call_id?: string;
  caller_name: string;
  phone: string;
  reason: string;
  requested_time: string;
}

export interface DeliveryResult {
  status: number;
  json: Record<string, unknown>;
}

export interface Delivery extends DeliveryResult {
  kind: DeliveryKind;
  body: string;
  signature: string;
}

export type Deliver = (rawBody: string, signature: string) => Promise<DeliveryResult>;

const FIRST_NAMES = ["Maya", "Liam", "Noor", "Mateo", "Priya", "Jonas", "Amara", "Theo", "Sofia", "Kenji", "Isla", "Omar", "Hana", "Diego", "Freya", "Tariq", "Elena", "Callum", "Zara", "Felix"];
const LAST_NAMES = ["Alder", "Brennan", "Castillo", "Dubois", "Eriksen", "Farouk", "Gallagher", "Hartmann", "Ishikawa", "Jovanovic", "Kowalski", "Lindqvist", "Moreau", "Nakamura", "Okafor", "Petrov", "Quinn", "Rossi", "Sandhu", "Tanaka"];
const AREA_CODES = ["212", "312", "415", "617", "305", "206", "512", "720"];
const REASONS = [
  "Wants to book a routine check-up and asked about morning availability.",
  "Needs to reschedule an existing appointment to later in the week.",
  "New client enquiring about a first consultation and what to bring.",
  "Follow-up visit after last month's appointment; no urgency.",
  "Asked for the earliest opening for a cleaning, flexible on the day.",
  "Calling about an invoice question; asked for a call back from billing.",
  "Would like a 30-minute consultation about treatment options.",
  "Reports mild discomfort and wants to be seen within the next few days.",
  "Wants to confirm the address and parking, and book a visit.",
  "Booking for a family member who needs a standard appointment.",
];

const CLINIC_OFFSET_HOURS = -5;
const HOUR_WEIGHTS = [8, 9, 9, 10, 10, 10, 11, 11, 13, 14, 14, 15, 15, 16, 17];

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
const pad = (n: number) => String(n).padStart(2, "0");
const callId = (rng: Rng) => `call_sim_${Math.floor(rng() * 36 ** 8).toString(36).padStart(8, "0")}`;

// mulberry32: the same seed always gives the same sequence.
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomCall(rng: Rng, now: Date): Payload {
  // Wall-clock fields in the clinic's offset are the UTC getters of the shifted date.
  const wall = new Date(now.getTime() + CLINIC_OFFSET_HOURS * 3_600_000);
  wall.setUTCDate(wall.getUTCDate() + 1 + Math.floor(rng() * 14));
  const weekday = wall.getUTCDay();
  if ((weekday === 0 || weekday === 6) && rng() < 0.9) wall.setUTCDate(wall.getUTCDate() + (weekday === 6 ? 2 : 1));

  const date = `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;
  const time = `${pad(pick(rng, HOUR_WEIGHTS))}:${pad(pick(rng, [0, 15, 30, 45]))}:00`;

  return {
    call_id: callId(rng),
    caller_name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    phone: `(${pick(rng, AREA_CODES)}) 555-01${pad(Math.floor(rng() * 100))}`,
    reason: pick(rng, REASONS),
    requested_time: `${date}T${time}-05:00`,
  };
}

export function duplicateOf(rng: Rng, original: Payload): Payload {
  if (rng() < 0.5) return { ...original };

  // A second call for the same slot: new call id, different phone formatting, reworded summary.
  const digits = original.phone.replace(/\D/g, "");
  return {
    call_id: callId(rng),
    caller_name: original.caller_name.replace(/^(\w)\w+/, (first) => first.slice(0, -1) + "e"),
    phone: `+1 ${digits.slice(-10, -7)} ${digits.slice(-7, -4)} ${digits.slice(-4)}`,
    reason: pick(rng, REASONS),
    requested_time: original.requested_time,
  };
}

export function invalidCall(rng: Rng, now: Date): Record<string, unknown> {
  const call: Record<string, unknown> = { ...randomCall(rng, now) };
  switch (Math.floor(rng() * 4)) {
    case 0:
      call.phone = "call me maybe";
      break;
    case 1:
      call.requested_time = "sometime next week";
      break;
    case 2:
      call.caller_name = "  ";
      break;
    default:
      delete call.reason;
  }
  return call;
}

export function toPayload(call: CallSummary): Payload {
  return {
    ...(call.callId ? { call_id: call.callId } : {}),
    caller_name: call.callerName,
    phone: call.phone,
    reason: call.reason,
    requested_time: call.requestedTime,
  };
}

export class Simulator {
  readonly #deliver: Deliver;
  readonly #secret: string;
  readonly #rng: Rng;
  readonly #latest: () => Payload | undefined;

  constructor(options: { deliver: Deliver; secret: string; latest: () => Payload | undefined; seed?: number }) {
    this.#deliver = options.deliver;
    this.#secret = options.secret;
    this.#latest = options.latest;
    this.#rng = createRng(options.seed ?? Date.now());
  }

  // A duplicate repeats the most recent stored call, so with nothing stored it sends a new call instead.
  async send(kind: DeliveryKind, now = new Date()): Promise<Delivery> {
    const previous = kind === "duplicate" ? this.#latest() : undefined;
    if (kind === "duplicate" && !previous) kind = "call";

    let body: unknown;
    let secret = this.#secret;
    switch (kind) {
      case "call":
        body = randomCall(this.#rng, now);
        break;
      case "duplicate":
        body = duplicateOf(this.#rng, previous!);
        break;
      case "invalid":
        body = invalidCall(this.#rng, now);
        break;
      case "unsigned":
        body = randomCall(this.#rng, now);
        secret = "not-the-shared-secret";
        break;
    }

    const raw = JSON.stringify(body);
    const signature = sign(raw, secret);
    return { kind, body: raw, signature, ...(await this.#deliver(raw, signature)) };
  }
}

// Calls the webhook handler directly, so the whole pipeline runs without a network hop.
export function deliverToWebhook(deps: WebhookDeps): Deliver {
  return async (rawBody, signature) => {
    const request = new Request("http://localhost/api/webhooks/call-summary", {
      method: "POST",
      headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signature },
      body: rawBody,
    });
    const response = await handleCallSummary(request, deps);
    return { status: response.status, json: (await response.json()) as Record<string, unknown> };
  };
}
