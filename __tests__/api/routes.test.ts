import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign, SIGNATURE_HEADER } from "@/lib/signature";
import type { CallStore } from "@/lib/store";
import { SECRET, validPayload } from "../helpers";

const shared = globalThis as typeof globalThis & { callStore?: CallStore; simulator?: unknown };

function configure(env: Record<string, string> = {}) {
  vi.stubEnv("DATABASE_PATH", ":memory:");
  vi.stubEnv("WEBHOOK_SECRET", SECRET);
  vi.stubEnv("DEMO_MODE", "");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

const signed = (body: unknown) => {
  const raw = JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/call-summary", { method: "POST", headers: { [SIGNATURE_HEADER]: sign(raw, SECRET) }, body: raw });
};

const demoSend = (kind: string) => new Request(`http://localhost/api/demo/send?kind=${kind}`, { method: "POST" });
const demoCalls = () => new Request("http://localhost/api/demo/calls");

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  try {
    shared.callStore?.close();
  } catch {
    // A test may already have closed it.
  }
  delete shared.callStore;
  delete shared.simulator;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/call-summary", () => {
  it("stores a call using the configured secret and database", async () => {
    configure();
    const { POST } = await import("@/app/api/webhooks/call-summary/route");

    expect((await POST(signed(validPayload))).status).toBe(201);
    expect(shared.callStore?.count()).toBe(1);
    expect((await POST(signed(validPayload))).status).toBe(200);
  });

  it("refuses a request signed with another secret", async () => {
    configure();
    const { POST } = await import("@/app/api/webhooks/call-summary/route");
    const raw = JSON.stringify(validPayload);
    const request = new Request("http://localhost/x", { method: "POST", headers: { [SIGNATURE_HEADER]: sign(raw, "another-secret-value") }, body: raw });
    expect((await POST(request)).status).toBe(401);
  });

  it("answers a plain 500 instead of crashing when the secret is missing", async () => {
    configure({ WEBHOOK_SECRET: "" });
    const { POST } = await import("@/app/api/webhooks/call-summary/route");

    const response = await POST(signed(validPayload));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ status: "error" });
  });

  it("only answers POST", async () => {
    configure();
    const route = await import("@/app/api/webhooks/call-summary/route");
    expect(Object.keys(route).filter((name) => /^(GET|PUT|PATCH|DELETE)$/.test(name))).toEqual([]);
  });
});

describe("demo routes", () => {
  it("are all 404 outside demo mode", async () => {
    configure();
    const send = await import("@/app/api/demo/send/route");
    const calls = await import("@/app/api/demo/calls/route");

    expect((await send.POST(demoSend("call"))).status).toBe(404);
    expect((await calls.GET(demoCalls())).status).toBe(404);
    expect((await calls.DELETE(new Request("http://localhost/api/demo/calls", { method: "DELETE" }))).status).toBe(404);
  });

  it("do not need a key in demo mode", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: "" });
    const { POST } = await import("@/app/api/demo/send/route");

    const response = await POST(demoSend("call"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: "call", response: { status: 201 } });
  });

  it("share one database with the webhook, so a real request shows up in the list", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: SECRET });
    const webhook = await import("@/app/api/webhooks/call-summary/route");
    const calls = await import("@/app/api/demo/calls/route");

    await webhook.POST(signed(validPayload));
    const body = (await (await calls.GET(demoCalls())).json()) as { total: number; calls: Array<{ caller_name: string }> };
    expect(body.total).toBe(1);
    expect(body.calls[0]?.caller_name).toBe("Jane Sample");
  });

  it("start empty, with no made-up history", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: "" });
    const { GET } = await import("@/app/api/demo/calls/route");
    expect(await (await GET(demoCalls())).json()).toEqual({ total: 0, calls: [] });
  });

  it("answer a plain 500, not a crash, when the store is broken", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: "" });
    const send = await import("@/app/api/demo/send/route");
    const calls = await import("@/app/api/demo/calls/route");

    await send.POST(demoSend("call"));
    shared.callStore?.close();

    const list = await calls.GET(demoCalls());
    expect(list.status).toBe(500);
    expect(await list.json()).toEqual({ status: "error" });
  });

  it("show the webhook's own 500 when sending into a broken store", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: "" });
    const send = await import("@/app/api/demo/send/route");

    await send.POST(demoSend("call"));
    shared.callStore?.close();

    const response = await send.POST(demoSend("call"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ response: { status: 500, body: { status: "error" } } });
  });

  it("can be cleared", async () => {
    configure({ DEMO_MODE: "1", WEBHOOK_SECRET: "" });
    const send = await import("@/app/api/demo/send/route");
    const calls = await import("@/app/api/demo/calls/route");

    await send.POST(demoSend("call"));
    expect((await calls.DELETE(new Request("http://localhost/api/demo/calls", { method: "DELETE" }))).status).toBe(200);
    expect(await (await calls.GET(demoCalls())).json()).toEqual({ total: 0, calls: [] });
  });
});
