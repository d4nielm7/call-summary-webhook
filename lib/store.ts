import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CallSummary } from "./schema";

export type MatchedOn = "call_id" | "slot";

export interface StoredCall extends CallSummary {
  id: string;
  receivedAt: string;
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

  latest(limit: number): StoredCall[] {
    const rows = this.#db
      .prepare("SELECT * FROM calls ORDER BY received_at DESC, rowid DESC LIMIT ?")
      .all(limit) as unknown as CallRow[];
    return rows.map(toStoredCall);
  }

  get(id: string): StoredCall | undefined {
    const row = this.#db.prepare("SELECT * FROM calls WHERE id = ?").get(id) as CallRow | undefined;
    return row && toStoredCall(row);
  }

  count(): number {
    return (this.#db.prepare("SELECT COUNT(*) AS n FROM calls").get() as { n: number }).n;
  }

  clear(): void {
    this.#db.exec("DELETE FROM calls");
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
