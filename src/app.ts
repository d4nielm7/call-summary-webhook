import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseCallSummary } from "./schema.ts";
import { SIGNATURE_HEADER, verifySignature } from "./signature.ts";
import type { CallStore } from "./store.ts";

export interface AppOptions {
  store: CallStore;
  /** Shared secret the receptionist platform uses to sign request bodies. */
  secret: string;
  maxBodyBytes?: number;
  /** Receives one structured line per request. Never given caller data. */
  log?: (entry: Record<string, unknown>) => void;
}

/**
 * Status codes are chosen for how webhook senders react to them:
 *   2xx  delivered, don't retry   (201 created, 200 duplicate: a replay is a success, not an error)
 *   4xx  our verdict on the payload, retrying the same bytes can't help (400, 401, 413, 422)
 *   5xx  our fault, please retry
 */
export function createApp({ store, secret, maxBodyBytes = 64 * 1024, log = () => {} }: AppOptions): Hono {
  if (!secret) throw new Error("a webhook secret is required");

  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.post(
    "/webhooks/call-summary",
    bodyLimit({
      maxSize: maxBodyBytes,
      onError: (c) => c.json({ status: "too_large" }, 413),
    }),
    async (c) => {
      // Verify the signature over the raw bytes BEFORE parsing anything.
      const raw = await c.req.text();
      if (!verifySignature(raw, c.req.header(SIGNATURE_HEADER), secret)) {
        log({ event: "call_summary", outcome: "unauthorized" });
        return c.json({ status: "unauthorized" }, 401);
      }

      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        log({ event: "call_summary", outcome: "invalid_json" });
        return c.json({ status: "invalid_json" }, 400);
      }

      const parsed = parseCallSummary(body);
      if (!parsed.ok) {
        log({ event: "call_summary", outcome: "invalid", fields: parsed.errors.map((e) => e.field) });
        return c.json({ status: "invalid", errors: parsed.errors }, 422);
      }

      const saved = store.save(parsed.value);
      if (saved.created) {
        log({ event: "call_summary", outcome: "created", id: saved.id });
        return c.json({ status: "created", id: saved.id }, 201);
      }
      log({ event: "call_summary", outcome: "duplicate", id: saved.id, matched_on: saved.matchedOn });
      return c.json({ status: "duplicate", id: saved.id, matched_on: saved.matchedOn }, 200);
    },
  );

  app.notFound((c) => c.json({ status: "not_found" }, 404));
  app.onError((err, c) => {
    log({ event: "call_summary", outcome: "error", error: err.message });
    return c.json({ status: "error" }, 500);
  });

  return app;
}
