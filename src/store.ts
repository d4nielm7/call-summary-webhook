import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CallSummary } from "./schema.ts";

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
    `);
  }

  /**
   * Inserts the call unless it is a duplicate. The check and the insert are ONE statement
   * (`ON CONFLICT DO NOTHING` against the UNIQUE constraints), so two identical requests
   * arriving at the same moment, even from different processes, cannot both be stored.
   */
  save(call: CallSummary): SaveResult {
    const id = randomUUID();
    const fingerprint = slotFingerprint(call);
    const { changes } = this.#db
      .prepare(
        `INSERT INTO calls (id, call_id, fingerprint, caller_name, phone, reason, requested_time, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run(id, call.callId, fingerprint, call.callerName, call.phone, call.reason, call.requestedTime, new Date().toISOString());
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

  get(id: string): StoredCall | undefined {
    const row = this.#db.prepare("SELECT * FROM calls WHERE id = ?").get(id) as Row | undefined;
    return row && {
      id: row.id,
      callId: row.call_id,
      callerName: row.caller_name,
      phone: row.phone,
      reason: row.reason,
      requestedTime: row.requested_time,
      receivedAt: row.received_at,
    };
  }

  count(): number {
    return (this.#db.prepare("SELECT COUNT(*) AS n FROM calls").get() as { n: number }).n;
  }

  close(): void {
    this.#db.close();
  }
}
