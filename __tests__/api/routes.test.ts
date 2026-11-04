import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign, SIGNATURE_HEADER } from "@/lib/signature";
import type { CallStore } from "@/lib/store";
import { DASHBOARD_TOKEN, SECRET, validPayload } from "../helpers";

const shared = globalThis as typeof globalThis & { callStore?: CallStore; simulator?: unknown };

function configure(env: Record<string, string>) {
  vi.stubEnv("DATABASE_PATH", ":memory:");
  vi.stubEnv("WEBHOOK_SECRET", SECRET);
  vi.stubEnv("DASHBOARD_TOKEN", DASHBOARD_TOKEN);
  vi.stubEnv("DEMO_MODE", "");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

const signed = (body: unknown) => {
  const raw = JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/call-summary", { method: "POST", headers: { [SIGNATURE_HEADER]: sign(raw, SECRET) }, body: raw });
};

const dashboard = (days = 14) => new Request(`http://localhost/api/dashboard?days=${days}`, { headers: { authorization: `Bearer ${DASHBOARD_TOKEN}` } });

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  shared.callStore?.close();
  delete shared.callStore;
  delete shared.simulator;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("route handlers", () => {
  it("POST /api/webhooks/call-summary stores a call using the configured secret and database", async () => {
    configure({});
    const { POST } = await import("@/app/api/webhooks/call-summary/route");

    const response = await POST(signed(validPayload));
    expect(response.status).toBe(201);
    expect(shared.callStore?.count()).toBe(1);
    expect((await POST(signed(validPayload))).status).toBe(200);
  });

  it("shares one database between the webhook and the dashboard", async () => {
    configure({});
    const { POST } = await import("@/app/api/webhooks/call-summary/route");
    const { GET } = await import("@/app/api/dashboard/route");

    await POST(signed(validPayload));
    const body = (await (await GET(dashboard())).json()) as { totals: { stored: number }; calls: Array<{ caller_name: string }> };
    expect(body.totals.stored).toBe(1);
    expect(body.calls[0]?.caller_name).toBe("Jane Sample");
  });

  it("GET /api/dashboard is a 404 when DASHBOARD_TOKEN is not set", async () => {
    configure({ DASHBOARD_TOKEN: "" });
    const { GET } = await import("@/app/api/dashboard/route");
    expect((await GET(dashboard())).status).toBe(404);
  });

  it("answers a plain 500 instead of crashing when the secret is missing", async () => {
    configure({ WEBHOOK_SECRET: "" });
    const { POST } = await import("@/app/api/webhooks/call-summary/route");

    const response = await POST(signed(validPayload));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ status: "error" });
  });

  it("GET /api/health reports ok", async () => {
    const { GET } = await import("@/app/api/health/route");
    expect(await GET().json()).toEqual({ status: "ok" });
  });

  it("POST /api/demo/simulate is a 404 outside demo mode", async () => {
    configure({});
    const { POST } = await import("@/app/api/demo/simulate/route");
    const request = new Request("http://localhost/api/demo/simulate?kind=call", { method: "POST", headers: { authorization: `Bearer ${DASHBOARD_TOKEN}` } });
    expect((await POST(request)).status).toBe(404);
  });

  it("POST /api/demo/simulate sends a signed call through the webhook in demo mode, with no key", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: "", DASHBOARD_TOKEN: "" });
    const { POST } = await import("@/app/api/demo/simulate/route");

    const response = await POST(new Request("http://localhost/api/demo/simulate?kind=call", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: "call", status: 201 });
  });

  it("GET /api/dashboard is open in demo mode", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: "", DASHBOARD_TOKEN: "" });
    const { GET } = await import("@/app/api/dashboard/route");

    const response = await GET(new Request("http://localhost/api/dashboard"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ demo: true });
  });

  it("GET /api/dashboard asks for the token in demo mode when one is set", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: "" });
    const { GET } = await import("@/app/api/dashboard/route");
    expect((await GET(new Request("http://localhost/api/dashboard"))).status).toBe(401);
    expect((await GET(dashboard())).status).toBe(200);
  });

  it("GET /api/dashboard still needs the token outside demo mode", async () => {
    configure({});
    const { GET } = await import("@/app/api/dashboard/route");
    expect((await GET(new Request("http://localhost/api/dashboard"))).status).toBe(401);
  });

  it("seeds a fresh demo database with history once", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: "", DASHBOARD_TOKEN: "" });
    const { getStore } = await import("@/lib/db");
    const count = getStore().count();
    expect(count).toBeGreaterThan(100);
    expect(getStore().count()).toBe(count);
  });

  it("does not seed outside demo mode", async () => {
    configure({});
    const { getStore } = await import("@/lib/db");
    expect(getStore().count()).toBe(0);
  });
});
