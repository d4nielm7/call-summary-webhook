import { json, readBody } from "../http";
import { parseCallSummary } from "../schema";
import { SIGNATURE_HEADER, verifySignature } from "../signature";
import type { CallStore, MatchedOn, Outcome } from "../store";

export const MAX_BODY_BYTES = 64 * 1024;

export type Logger = (entry: Record<string, unknown>) => void;

export interface WebhookDeps {
  store: CallStore;
  secret: string;
  maxBodyBytes?: number;
  log?: Logger;
}

// 2xx: delivered, don't retry (a replay is a success). 4xx: our verdict, retrying can't help.
// 5xx: our fault, please retry.
export async function handleCallSummary(request: Request, deps: WebhookDeps): Promise<Response> {
  const { store, secret, maxBodyBytes = MAX_BODY_BYTES, log = () => {} } = deps;

  const track = (event: { outcome: Outcome; callRef?: string; matchedOn?: MatchedOn }) => {
    try {
      store.recordEvent(event);
    } catch (error) {
      log({ event: "track_failed", error: String(error) });
    }
  };

  try {
    const raw = await readBody(request, maxBodyBytes);
    if (raw === null) return json({ status: "too_large" }, 413);

    // Verify the signature over the raw bytes before parsing anything.
    if (!verifySignature(raw, request.headers.get(SIGNATURE_HEADER), secret)) {
      track({ outcome: "unauthorized" });
      log({ event: "call_summary", outcome: "unauthorized" });
      return json({ status: "unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      track({ outcome: "invalid" });
      log({ event: "call_summary", outcome: "invalid_json" });
      return json({ status: "invalid_json" }, 400);
    }

    const parsed = parseCallSummary(body);
    if (!parsed.ok) {
      track({ outcome: "invalid" });
      log({ event: "call_summary", outcome: "invalid", fields: parsed.errors.map((e) => e.field) });
      return json({ status: "invalid", errors: parsed.errors }, 422);
    }

    const saved = store.save(parsed.value);
    if (saved.created) {
      track({ outcome: "created", callRef: saved.id });
      log({ event: "call_summary", outcome: "created", id: saved.id });
      return json({ status: "created", id: saved.id }, 201);
    }

    track({ outcome: "duplicate", callRef: saved.id, matchedOn: saved.matchedOn });
    log({ event: "call_summary", outcome: "duplicate", id: saved.id, matched_on: saved.matchedOn });
    return json({ status: "duplicate", id: saved.id, matched_on: saved.matchedOn }, 200);
  } catch (error) {
    log({ event: "call_summary", outcome: "error", error: String(error) });
    return json({ status: "error" }, 500);
  }
}
