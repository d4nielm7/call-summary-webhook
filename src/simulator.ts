import { sign } from "./signature.ts";

/**
 * A stand-in for the AI receptionist. It invents fictional callers and "delivers" them to the webhook
 * exactly as the real platform would (signed JSON), so the dashboard can be demonstrated, and the
 * whole pipeline exercised, without any real call data. Every name is made up and every phone number
 * sits in the 555-01xx block reserved for fiction.
 */

export type Rng = () => number;

/** Small deterministic PRNG (mulberry32): the same seed always tells the same story. */
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

export type DeliveryKind = "call" | "duplicate" | "invalid" | "unsigned";

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

/** Sends one signed-or-not request body to the webhook. The caller decides how (HTTP, or in-process). */
export type Deliver = (rawBody: string, signature: string) => Promise<DeliveryResult>;

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
const pad = (n: number) => String(n).padStart(2, "0");

/** A fictional clinic keeps appointments in UTC-5, so requested times are written with that offset. */
const CLINIC_OFFSET_HOURS = -5;
const HOUR_WEIGHTS = [8, 9, 9, 10, 10, 10, 11, 11, 13, 14, 14, 15, 15, 16, 17];

export function randomCall(rng: Rng, now: Date): Payload {
  // Wall-clock fields in the clinic's offset live in the shifted date's UTC getters.
  const wall = new Date(now.getTime() + CLINIC_OFFSET_HOURS * 3_600_000);
  wall.setUTCDate(wall.getUTCDate() + 1 + Math.floor(rng() * 14));
  // Mostly weekdays: roll weekend requests onto Monday nine times in ten.
  const dow = wall.getUTCDay();
  if ((dow === 0 || dow === 6) && rng() < 0.9) wall.setUTCDate(wall.getUTCDate() + (dow === 6 ? 2 : 1));
  const hour = pick(rng, HOUR_WEIGHTS);
  const minute = pick(rng, [0, 15, 30, 45]);
  const date = `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;

  return {
    call_id: `call_sim_${Math.floor(rng() * 36 ** 8).toString(36).padStart(8, "0")}`,
    caller_name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    phone: `(${pick(rng, AREA_CODES)}) 555-01${pad(Math.floor(rng() * 100))}`,
    reason: pick(rng, REASONS),
    requested_time: `${date}T${pad(hour)}:${pad(minute)}:00-05:00`,
  };
}

/** The same request coming in again, the way a retry or a second call would. */
export function duplicateOf(rng: Rng, original: Payload): Payload {
  if (rng() < 0.5) return { ...original }; // the platform re-sent the webhook, byte for byte
  // A second call for the same slot: new call id, phone written differently, summary reworded.
  const digits = original.phone.replace(/\D/g, "");
  return {
    call_id: `call_sim_${Math.floor(rng() * 36 ** 8).toString(36).padStart(8, "0")}`,
    caller_name: original.caller_name.replace(/^(\w)\w+/, (m) => m.slice(0, -1) + "e"),
    phone: `+1 ${digits.slice(-10, -7)} ${digits.slice(-7, -4)} ${digits.slice(-4)}`,
    reason: pick(rng, REASONS),
    requested_time: original.requested_time,
  };
}

/** A payload with one thing wrong with it, the kind of mistake a speech pipeline really makes. */
export function invalidCall(rng: Rng, now: Date): Record<string, unknown> {
  const call: Record<string, unknown> = { ...randomCall(rng, now) };
  switch (Math.floor(rng() * 4)) {
    case 0: call.phone = "call me maybe"; break;
    case 1: call.requested_time = "sometime next week"; break;
    case 2: call.caller_name = "  "; break;
    default: delete call.reason;
  }
  return call;
}

export class Simulator {
  readonly #deliver: Deliver;
  readonly #secret: string;
  readonly #rng: Rng;
  readonly #recent: Payload[] = [];

  constructor(opts: { deliver: Deliver; secret: string; seed?: number }) {
    this.#deliver = opts.deliver;
    this.#secret = opts.secret;
    this.#rng = createRng(opts.seed ?? Date.now());
  }

  async send(kind: DeliveryKind, now = new Date()): Promise<{ kind: DeliveryKind; status: number; json: Record<string, unknown> }> {
    // A replay needs something to replay: fall back to a fresh call on an empty history.
    if (kind === "duplicate" && this.#recent.length === 0) kind = "call";

    let body: unknown;
    let secret = this.#secret;
    switch (kind) {
      case "call": {
        const call = randomCall(this.#rng, now);
        this.#recent.push(call);
        if (this.#recent.length > 20) this.#recent.shift();
        body = call;
        break;
      }
      case "duplicate":
        body = duplicateOf(this.#rng, pick(this.#rng, this.#recent));
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
    const result = await this.#deliver(raw, sign(raw, secret));
    return { kind, ...result };
  }

  /** What a busy day looks like: mostly new calls, some retries, a few mistakes. */
  nextKind(): DeliveryKind {
    const r = this.#rng();
    return r < 0.7 ? "call" : r < 0.85 ? "duplicate" : r < 0.96 ? "invalid" : "unsigned";
  }
}

/** Delivers in-process, straight into a Hono app: the full pipeline runs, only the network is skipped. */
export function deliverTo(target: { request: (path: string, init: RequestInit) => Response | Promise<Response> }): Deliver {
  return async (rawBody, signature) => {
    const res = await target.request("/webhooks/call-summary", {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-signature": signature },
      body: rawBody,
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
}

/** Delivers over real HTTP to a running server. */
export function deliverOverHttp(baseUrl: string): Deliver {
  return async (rawBody, signature) => {
    const res = await fetch(new URL("/webhooks/call-summary", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-signature": signature },
      body: rawBody,
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
}
