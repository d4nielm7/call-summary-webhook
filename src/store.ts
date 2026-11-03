import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CallSummary } from "./schema.ts";

export type Outcome = "created" | "duplicate" | "invalid" | "unauthorized";

export interface DeliveryEvent {
  id: number;
  at: string;
  outcome: Outcome;
  matchedOn: "call_id" | "slot" | null;
  /** The call this delivery created or matched. Null for deliveries that were refused. */
  call: Pick<StoredCall, "callerName" | "reason" | "requestedTime"> | null;
}

/** How many delivery events to keep. Old ones are pruned on insert, so a flood can't grow the file forever. */
const MAX_EVENTS = 20_000;

export type SaveResult =
  | { created: true; id: string }
  | { created: false; id: string; matchedOn: "call_id" | "slot" };

export interface StoredCall extends CallSummary {
  id: string;
  receivedAt: string;
}

interface Row {
  id: string;
  call_id: string | null;
  caller_name: string;
  phone: string;
  reason: string;
  requested_time: string;
  received_at: string;
}

/**
 * Duplicate rule: a call is a duplicate of an existing one if
 *   1. it carries the same `call_id` (the platform retried the webhook), or
 *   2. it asks for the same appointment slot from the same phone number.
 *
 * The caller's name is deliberately NOT part of the key: speech-to-text spells the same
 * person differently from call to call ("Jon" / "John"). The reason is not part of it either,
 * for the same reason: an LLM-written summary of the same request is rarely word-for-word equal.
 */
export function slotFingerprint(call: Pick<CallSummary, "phone" | "requestedTime">): string {
  return createHash("sha256").update(`${call.phone}|${call.requestedTime}`).digest("hex");
}

export class CallStore {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS calls (
        id             TEXT PRIMARY KEY,
        call_id        TEXT UNIQUE,            -- NULLs allowed, and any number of them
        fingerprint    TEXT NOT NULL UNIQUE,
        caller_name    TEXT NOT NULL,
        phone          TEXT NOT NULL,
        reason         TEXT NOT NULL,
        requested_time TEXT NOT NULL,
        received_at    TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS calls_received_at ON calls (received_at);

      -- One row per delivery attempt, whatever happened to it. Holds no caller data (that lives in
      -- calls, reached through call_ref), which is what makes "duplicates blocked" countable.
      CREATE TABLE IF NOT EXISTS events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        at         TEXT NOT NULL,
        outcome    TEXT NOT NULL CHECK (outcome IN ('created', 'duplicate', 'invalid', 'unauthorized')),
        call_ref   TEXT,
        matched_on TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS events_at ON events (at);
    `);
  }

  /**
   * Inserts the call unless it is a duplicate. The check and the insert are ONE statement
   * (`ON CONFLICT DO NOTHING` against the UNIQUE constraints), so two identical requests
   * arriving at the same moment, even from different processes, cannot both be stored.
   */
  save(call: CallSummary, options: { at?: string } = {}): SaveResult {
    const id = randomUUID();
    const fingerprint = slotFingerprint(call);
    const { changes } = this.#db
      .prepare(
        `INSERT INTO calls (id, call_id, fingerprint, caller_name, phone, reason, requested_time, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run(id, call.callId, fingerprint, call.callerName, call.phone, call.reason, call.requestedTime, options.at ?? new Date().toISOString());
    if (changes === 1) return { created: true, id };

    if (call.callId !== null) {
      const byCallId = this.#db.prepare("SELECT id FROM calls WHERE call_id = ?").get(call.callId) as { id: string } | undefined;
      if (byCallId) return { created: false, id: byCallId.id, matchedOn: "call_id" };
    }
    const bySlot = this.#db.prepare("SELECT id FROM calls WHERE fingerprint = ?").get(fingerprint) as { id: string } | undefined;
    if (bySlot) return { created: false, id: bySlot.id, matchedOn: "slot" };

    // Insert was ignored but the conflicting row is gone (deleted between the two statements).
    throw new Error("insert conflicted but no matching row was found");
  }

  /** Logs what happened to one delivery. Can throw; the webhook handler catches it so bookkeeping can never fail a delivery. */
  recordEvent(event: { outcome: Outcome; callRef?: string | null; matchedOn?: string | null; at?: string }): void {
    this.#db
      .prepare("INSERT INTO events (at, outcome, call_ref, matched_on) VALUES (?, ?, ?, ?)")
      .run(event.at ?? new Date().toISOString(), event.outcome, event.callRef ?? null, event.matchedOn ?? null);
    this.#db.exec(`DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - ${MAX_EVENTS}`);
  }

  eventsSince(sinceIso: string, limit = 50_000): Array<{ at: string; outcome: Outcome }> {
    return this.#db
      .prepare("SELECT at, outcome FROM events WHERE at >= ? ORDER BY at DESC LIMIT ?")
      .all(sinceIso, limit) as Array<{ at: string; outcome: Outcome }>;
  }

  callsSince(sinceIso: string, limit = 5000): StoredCall[] {
    const rows = this.#db
      .prepare("SELECT * FROM calls WHERE received_at >= ? ORDER BY received_at DESC, rowid DESC LIMIT ?")
      .all(sinceIso, limit) as unknown as Row[];
    return rows.map(toStoredCall);
  }

  recentEvents(limit: number): DeliveryEvent[] {
    const rows = this.#db
      .prepare(
        `SELECT e.id, e.at, e.outcome, e.matched_on, c.caller_name, c.reason, c.requested_time
         FROM events e LEFT JOIN calls c ON c.id = e.call_ref
         ORDER BY e.id DESC LIMIT ?`,
      )
      .all(limit) as Array<{
      id: number;
      at: string;
      outcome: Outcome;
      matched_on: "call_id" | "slot" | null;
      caller_name: string | null;
      reason: string | null;
      requested_time: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      outcome: r.outcome,
      matchedOn: r.matched_on,
      call: r.caller_name === null ? null : { callerName: r.caller_name, reason: r.reason ?? "", requestedTime: r.requested_time ?? "" },
    }));
  }

  get(id: string): StoredCall | undefined {
    const row = this.#db.prepare("SELECT * FROM calls WHERE id = ?").get(id) as Row | undefined;
    return row && toStoredCall(row);
  }

  count(): number {
    return (this.#db.prepare("SELECT COUNT(*) AS n FROM calls").get() as { n: number }).n;
  }

  close(): void {
    this.#db.close();
  }
}

function toStoredCall(row: Row): StoredCall {
  return {
    id: row.id,
    callId: row.call_id,
    callerName: row.caller_name,
    phone: row.phone,
    reason: row.reason,
    requestedTime: row.requested_time,
    receivedAt: row.received_at,
  };
}
