import { describe, expect, it } from "vitest";
import { deliverToWebhook, Simulator, toPayload } from "@/lib/demo/simulator";
import { handleDemoCalls, handleDemoClear, handleDemoSend, LIST_LIMIT } from "@/lib/handlers/demo";
import { CallStore } from "@/lib/store";
import { SECRET } from "../helpers";

function setup(demo = true) {
  const store = new CallStore(":memory:");
  const simulator = new Simulator({
    secret: SECRET,
    seed: 1,
    deliver: deliverToWebhook({ store, secret: SECRET }),
    latest: () => {
      const [call] = store.latest(1);
      return call && toPayload(call);
    },
  });
  const deps = { demo, store: () => store, simulator: () => simulator };
  const send = (kind?: string) =>
    handleDemoSend(new Request(`http://localhost/api/demo/send${kind === undefined ? "" : `?kind=${kind}`}`, { method: "POST" }), deps);
  return { store, deps, send };
}

interface Sent {
  kind: string;
  request: { signature: string; body: string };
  response: { status: number; body: { status: string } };
}

const outcome = async (response: Response) => {
  const body = (await response.json()) as Sent;
  return [body.kind, body.response.status, body.response.body.status];
};

describe("POST /api/demo/send", () => {
  it("is a 404 unless demo mode is on", async () => {
    const { send, store } = setup(false);
    expect((await send("call")).status).toBe(404);
    expect(store.count()).toBe(0);
  });

  it("plays each kind of delivery through the real webhook", async () => {
    const { send, store } = setup();

    expect(await outcome(await send("call"))).toEqual(["call", 201, "created"]);
    expect(store.count()).toBe(1);
    expect(await outcome(await send("duplicate"))).toEqual(["duplicate", 200, "duplicate"]);
    expect(store.count()).toBe(1);
    expect(await outcome(await send("invalid"))).toEqual(["invalid", 422, "invalid"]);
    expect(await outcome(await send("unsigned"))).toEqual(["unsigned", 401, "unauthorized"]);
    expect(store.count()).toBe(1);
  });

  it("defaults to a new call", async () => {
    const { send, store } = setup();
    expect(await outcome(await send())).toEqual(["call", 201, "created"]);
    expect(store.count()).toBe(1);
  });

  it("sends a new call when asked for a duplicate with nothing stored", async () => {
    expect(await outcome(await setup().send("duplicate"))).toEqual(["call", 201, "created"]);
  });

  it("repeats the last stored call as the duplicate", async () => {
    const { send, store } = setup();
    await send("call");
    await send("call");
    const latest = store.latest(1)[0]!;
    const body = (await (await send("duplicate")).json()) as Sent;
    expect(body.response.body).toMatchObject({ status: "duplicate", id: latest.id });
    expect(store.count()).toBe(2);
  });

  it("sends a new call again after the store was cleared", async () => {
    const { send, deps } = setup();
    await send("call");
    handleDemoClear(deps);
    expect(await outcome(await send("duplicate"))).toEqual(["call", 201, "created"]);
  });

  it("shows exactly what was sent, so the request can be replayed", async () => {
    const body = (await (await setup().send("call")).json()) as Sent;
    expect(body.request.signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(JSON.parse(body.request.body)).toMatchObject({ caller_name: expect.any(String), phone: expect.any(String) });
  });

  it.each(["explode", "", "CALL", "call;drop"])("422s the unknown kind %j", async (kind) => {
    expect((await setup().send(kind)).status).toBe(422);
  });
});

describe("GET /api/demo/calls", () => {
  it("is a 404 unless demo mode is on", () => {
    expect(handleDemoCalls(setup(false).deps).status).toBe(404);
  });

  it("is empty before anything is sent", async () => {
    expect(await handleDemoCalls(setup().deps).json()).toEqual({ total: 0, calls: [] });
  });

  it("lists stored calls newest first, with the wire field names", async () => {
    const { send, deps } = setup();
    await send("call");
    await send("call");
    const body = (await handleDemoCalls(deps).json()) as { total: number; calls: Array<Record<string, string>> };

    expect(body.total).toBe(2);
    expect(Object.keys(body.calls[0]!).sort()).toEqual(["caller_name", "id", "phone", "reason", "received_at", "requested_time"]);
    expect(Date.parse(body.calls[0]!.received_at!)).toBeGreaterThanOrEqual(Date.parse(body.calls[1]!.received_at!));
  });

  it("does not list refused deliveries", async () => {
    const { send, deps } = setup();
    await send("invalid");
    await send("unsigned");
    expect(await handleDemoCalls(deps).json()).toEqual({ total: 0, calls: [] });
  });

  it("caps the list but reports the real total", async () => {
    const { send, deps } = setup();
    for (let i = 0; i < LIST_LIMIT + 3; i++) await send("call");
    const body = (await handleDemoCalls(deps).json()) as { total: number; calls: unknown[] };
    expect(body.calls).toHaveLength(LIST_LIMIT);
    expect(body.total).toBe(LIST_LIMIT + 3);
  });

  it("is never cached", () => {
    expect(handleDemoCalls(setup().deps).headers.get("cache-control")).toBe("no-store");
  });
});

describe("DELETE /api/demo/calls", () => {
  it("is a 404 unless demo mode is on", () => {
    expect(handleDemoClear(setup(false).deps).status).toBe(404);
  });

  it("empties the store", async () => {
    const { send, deps, store } = setup();
    await send("call");
    expect(handleDemoClear(deps).status).toBe(200);
    expect(store.count()).toBe(0);
  });

  it("does not touch a store when demo mode is off", async () => {
    const { deps, store } = setup(false);
    store.save({ callId: null, callerName: "A", phone: "+15550100123", reason: "x", requestedTime: "2026-11-10T14:00:00.000Z" });
    handleDemoClear(deps);
    expect(store.count()).toBe(1);
  });
});
