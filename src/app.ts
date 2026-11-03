import { createHash, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ASSET_PATHS, readAsset } from "./assets.ts";
import { assertTimeZone, buildDashboard, RANGE_DAYS } from "./dashboard.ts";
import { parseCallSummary } from "./schema.ts";
import { SIGNATURE_HEADER, verifySignature } from "./signature.ts";
import { deliverTo, Simulator, type DeliveryKind } from "./simulator.ts";
import type { CallStore, Outcome } from "./store.ts";

export interface AppOptions {
  store: CallStore;
  /** Shared secret the receptionist platform uses to sign request bodies. */
  secret: string;
  /** Enables the dashboard and its data API. Without it they respond 404, since there is nothing safe to show. */
  dashboardToken?: string;
  /** IANA zone the dashboard counts days and hours in. Defaults to the fictional clinic's. */
  timeZone?: string;
  /** Adds POST /api/demo/simulate, which plays the receptionist so the dashboard can be demonstrated. */
  demo?: boolean;
  maxBodyBytes?: number;
  /** Receives one structured line per request. Never given caller data. */
  log?: (entry: Record<string, unknown>) => void;
}

const DEMO_KINDS: readonly DeliveryKind[] = ["call", "duplicate", "invalid", "unsigned"];

/**
 * Status codes are chosen for how webhook senders react to them:
 *   2xx  delivered, don't retry   (201 created, 200 duplicate: a replay is a success, not an error)
 *   4xx  our verdict on the payload, retrying the same bytes can't help (400, 401, 413, 422)
 *   5xx  our fault, please retry
 */
export function createApp({
  store,
  secret,
  dashboardToken,
  timeZone = "America/New_York",
  demo = false,
  maxBodyBytes = 64 * 1024,
  log = () => {},
}: AppOptions): Hono {
  if (!secret) throw new Error("a webhook secret is required");
  assertTimeZone(timeZone);

  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
  });

  /** Bookkeeping for the dashboard. A failure here must never turn a stored call into a 500. */
  function track(event: { outcome: Outcome; callRef?: string; matchedOn?: string }): void {
    try {
      store.recordEvent(event);
    } catch (err) {
      log({ event: "track_failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

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
        track({ outcome: "unauthorized" });
        log({ event: "call_summary", outcome: "unauthorized" });
        return c.json({ status: "unauthorized" }, 401);
      }

      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        track({ outcome: "invalid" });
        log({ event: "call_summary", outcome: "invalid_json" });
        return c.json({ status: "invalid_json" }, 400);
      }

      const parsed = parseCallSummary(body);
      if (!parsed.ok) {
        track({ outcome: "invalid" });
        log({ event: "call_summary", outcome: "invalid", fields: parsed.errors.map((e) => e.field) });
        return c.json({ status: "invalid", errors: parsed.errors }, 422);
      }

      const saved = store.save(parsed.value);
      if (saved.created) {
        track({ outcome: "created", callRef: saved.id });
        log({ event: "call_summary", outcome: "created", id: saved.id });
        return c.json({ status: "created", id: saved.id }, 201);
      }
      track({ outcome: "duplicate", callRef: saved.id, matchedOn: saved.matchedOn });
      log({ event: "call_summary", outcome: "duplicate", id: saved.id, matched_on: saved.matchedOn });
      return c.json({ status: "duplicate", id: saved.id, matched_on: saved.matchedOn }, 200);
    },
  );

  // ---- Dashboard -----------------------------------------------------------------------------
  // The page and its assets hold no data, so they are public. Everything with caller data sits behind the token.

  for (const path of ASSET_PATHS) {
    app.get(path, (c) => {
      const asset = readAsset(path);
      if (!asset) return c.json({ status: "not_found" }, 404);
      c.header("Content-Type", asset.type);
      c.header("Cache-Control", path.startsWith("/fonts/") ? "public, max-age=86400" : "no-cache");
      if (path === "/") {
        c.header(
          "Content-Security-Policy",
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        );
      }
      return c.body(new Uint8Array(asset.body));
    });
  }

  const tokenDigest = dashboardToken ? sha256(dashboardToken) : null;
  async function requireDashboardToken(c: Context, next: () => Promise<void>) {
    if (!tokenDigest) return c.json({ status: "not_found" }, 404);
    const given = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "")?.[1];
    // Hash both sides so the comparison is constant-length, then compare in constant time.
    if (!given || !timingSafeEqual(sha256(given), tokenDigest)) return c.json({ status: "unauthorized" }, 401);
    c.header("Cache-Control", "no-store");
    await next();
  }

  app.get("/api/dashboard", requireDashboardToken, (c) => {
    const days = Number(c.req.query("days") ?? 14);
    if (!(RANGE_DAYS as readonly number[]).includes(days)) {
      return c.json({ status: "invalid", errors: [{ field: "days", message: `must be one of ${RANGE_DAYS.join(", ")}` }] }, 422);
    }
    // `demo` tells the page whether to offer the "play the receptionist" buttons.
    return c.json({ ...buildDashboard(store, { days, timeZone }), demo });
  });

  if (demo) {
    const simulator = new Simulator({ secret, deliver: deliverTo(app) });
    app.post("/api/demo/simulate", requireDashboardToken, async (c) => {
      const kind = c.req.query("kind") ?? "call";
      if (!DEMO_KINDS.includes(kind as DeliveryKind)) {
        return c.json({ status: "invalid", errors: [{ field: "kind", message: `must be one of ${DEMO_KINDS.join(", ")}` }] }, 422);
      }
      const result = await simulator.send(kind as DeliveryKind);
      return c.json({ kind: result.kind, status: result.status, result: result.json });
    });
  }

  app.notFound((c) => c.json({ status: "not_found" }, 404));
  app.onError((err, c) => {
    log({ event: "call_summary", outcome: "error", error: err.message });
    return c.json({ status: "error" }, 500);
  });

  return app;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
