import { handleCallSummary, type WebhookDeps } from "@/lib/handlers/call-summary";
import { sign, SIGNATURE_HEADER } from "@/lib/signature";
import { CallStore } from "@/lib/store";

export const SECRET = "test-secret-0123456789abcdef";
export const DASHBOARD_TOKEN = "dashboard-token-0123456789";

export const validPayload = {
  call_id: "call_sample_0001",
  caller_name: "Jane Sample",
  phone: "(555) 010-0123",
  reason: "Would like to book a routine check-up.",
  requested_time: "2026-11-10T09:00:00-05:00",
};

export function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value } as Partial<T>;
  delete copy[key];
  return copy as Omit<T, K>;
}

export interface WebhookJson {
  status: string;
  id?: string;
  matched_on?: string;
  errors?: Array<{ field: string; message: string }>;
}

export function webhookRequest(body: unknown, options: { signature?: string | null; secret?: string } = {}): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const signature = options.signature === undefined ? sign(raw, options.secret ?? SECRET) : options.signature;
  if (signature !== null) headers[SIGNATURE_HEADER] = signature;
  return new Request("http://localhost/api/webhooks/call-summary", { method: "POST", headers, body: raw });
}

export function setup(overrides: Partial<WebhookDeps> = {}) {
  const store = new CallStore(":memory:");
  const deps: WebhookDeps = { store, secret: SECRET, ...overrides };

  async function post(body: unknown, options: { signature?: string | null } = {}) {
    const response = await handleCallSummary(webhookRequest(body, options), deps);
    return { status: response.status, json: (await response.json()) as WebhookJson };
  }

  return { store, deps, post };
}
