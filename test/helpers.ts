import { createApp } from "../src/app.ts";
import { sign, SIGNATURE_HEADER } from "../src/signature.ts";
import { CallStore } from "../src/store.ts";

export const SECRET = "test-secret-0123456789abcdef";

/** Sample data only: fictional people, numbers from the 555-01xx range reserved for fiction. */
export const validPayload = {
  call_id: "call_sample_0001",
  caller_name: "Jane Sample",
  phone: "(555) 010-0123",
  reason: "Would like to book a routine check-up.",
  requested_time: "2026-11-10T09:00:00-05:00",
};

export const DASHBOARD_TOKEN = "dashboard-token-0123456789";

export function setup(options: { maxBodyBytes?: number; dashboardToken?: string; demo?: boolean } = {}) {
  const store = new CallStore(":memory:");
  const app = createApp({ store, secret: SECRET, ...options });

  /** POSTs `body` (object or raw string) to the webhook, signed unless `signature` says otherwise. */
  async function post(body: unknown, opts: { signature?: string | null } = {}) {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    const headers: Record<string, string> = { "content-type": "application/json" };
    const signature = opts.signature === undefined ? sign(raw, SECRET) : opts.signature;
    if (signature !== null) headers[SIGNATURE_HEADER] = signature;
    const res = await app.request("/webhooks/call-summary", { method: "POST", headers, body: raw });
    return { status: res.status, json: (await res.json()) as Record<string, any> };
  }

  return { app, store, post };
}
