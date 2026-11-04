import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CallSummary } from "./schema";

export type Outcome = "created" | "duplicate" | "invalid" | "unauthorized";
export type MatchedOn = "call_id" | "slot";

export interface StoredCall extends CallSummary {
  id: string;
  receivedAt: string;
}

export interface DeliveryEvent {
  id: number;
  at: string;
  outcome: Outcome;
  matchedOn: MatchedOn | null;
  call: Pick<StoredCall, "callerName" | "reason" | "requestedTime"> | null;
}

export type SaveResult = { created: true; id: string } | { created: false; id: string; matchedOn: MatchedOn };

interface CallRow {
  id: string;
  call_id: string | null;
  caller_name: string;
  phone: string;
  reason: string;
  requested_time: string;
  received_at: string;
}

interface EventRow {
  id: number;
  at: string;
  outcome: Outcome;
  matched_on: MatchedOn | null;
  caller_name: string | null;
  reason: string | null;
  requested_time: string | null;
}

const MAX_EVENTS = 20_000;

// Name and reason are left out of the key on purpose: speech-to-text spells the same person
// differently between calls, and a model rarely words the same request the same way twice.
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
        call_id        TEXT UNIQUE,
        fingerprint    TEXT NOT NULL UNIQUE,
        caller_name    TEXT NOT NULL,
        phone          TEXT NOT NULL,
        reason         TEXT NOT NULL,
        requested_time TEXT NOT NULL,
        received_at    TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS calls_received_at ON calls (received_at);

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

  // The duplicate check and the insert are one statement, so two identical requests
  // arriving together can't both be stored.
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

    throw new Error("insert conflicted but no matching row was found");
  }

  recordEvent(event: { outcome: Outcome; callRef?: string | null; matchedOn?: MatchedOn | null; at?: string }): void {
    this.#db
      .prepare("INSERT INTO events (at, outcome, call_ref, matched_on) VALUES (?, ?, ?, ?)")
      .run(event.at ?? new Date().toISOString(), event.outcome, event.callRef ?? null, event.matchedOn ?? null);
    this.#db.prepare("DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - ?").run(MAX_EVENTS);
  }

  eventsSince(sinceIso: string, limit = 50_000): Array<{ at: string; outcome: Outcome }> {
    return this.#db
      .prepare("SELECT at, outcome FROM events WHERE at >= ? ORDER BY at DESC LIMIT ?")
      .all(sinceIso, limit) as Array<{ at: string; outcome: Outcome }>;
  }

  callsSince(sinceIso: string, limit = 5000): StoredCall[] {
    const rows = this.#db
      .prepare("SELECT * FROM calls WHERE received_at >= ? ORDER BY received_at DESC, rowid DESC LIMIT ?")
      .all(sinceIso, limit) as unknown as CallRow[];
    return rows.map(toStoredCall);
  }

  recentEvents(limit: number): DeliveryEvent[] {
    const rows = this.#db
      .prepare(
        `SELECT e.id, e.at, e.outcome, e.matched_on, c.caller_name, c.reason, c.requested_time
         FROM events e LEFT JOIN calls c ON c.id = e.call_ref
         ORDER BY e.id DESC LIMIT ?`,
      )
      .all(limit) as unknown as EventRow[];
    return rows.map((row) => ({
      id: row.id,
      at: row.at,
      outcome: row.outcome,
      matchedOn: row.matched_on,
      call:
        row.caller_name === null
          ? null
          : { callerName: row.caller_name, reason: row.reason ?? "", requestedTime: row.requested_time ?? "" },
    }));
  }

  get(id: string): StoredCall | undefined {
    const row = this.#db.prepare("SELECT * FROM calls WHERE id = ?").get(id) as CallRow | undefined;
    return row && toStoredCall(row);
  }

  count(): number {
    return (this.#db.prepare("SELECT COUNT(*) AS n FROM calls").get() as { n: number }).n;
  }

  close(): void {
    this.#db.close();
  }
}

function toStoredCall(row: CallRow): StoredCall {
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
