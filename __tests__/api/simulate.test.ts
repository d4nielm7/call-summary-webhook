import { describe, expect, it } from "vitest";
import { deliverToWebhook, Simulator } from "@/lib/demo/simulator";
import { handleSimulate } from "@/lib/handlers/simulate";
import { CallStore } from "@/lib/store";
import { DASHBOARD_TOKEN, SECRET } from "../helpers";

const auth = { authorization: `Bearer ${DASHBOARD_TOKEN}` };

function setup(overrides: { demo?: boolean; token?: string | undefined; open?: boolean } = {}) {
  const store = new CallStore(":memory:");
  const simulator = new Simulator({ secret: SECRET, seed: 1, deliver: deliverToWebhook({ store, secret: SECRET }) });
  const deps = { demo: true, token: DASHBOARD_TOKEN, simulator: () => simulator, ...overrides };
  const run = (kind: string, headers: Record<string, string> = auth) =>
    handleSimulate(new Request(`http://localhost/api/demo/simulate?kind=${kind}`, { method: "POST", headers }), deps);
  return { store, run };
}

const outcome = async (response: Response) => {
  const body = (await response.json()) as { kind: string; status: number; result: { status: string } };
  return [body.kind, body.status, body.result.status];
};

describe("POST /api/demo/simulate", () => {
  it("does not exist unless demo mode is on", async () => {
    expect((await setup({ demo: false }).run("call")).status).toBe(404);
  });

  it("does not exist without a dashboard token", async () => {
    expect((await setup({ token: undefined }).run("call")).status).toBe(404);
  });

  it("works without a token when the demo is open", async () => {
    const { run, store } = setup({ token: undefined, open: true });
    expect((await run("call", {})).status).toBe(200);
    expect(store.count()).toBe(1);
  });

  it("is still a 404 outside demo mode even if the dashboard is open", async () => {
    expect((await setup({ demo: false, open: true }).run("call", {})).status).toBe(404);
  });

  it("needs the dashboard token", async () => {
    const { run, store } = setup();
    expect((await run("call", {})).status).toBe(401);
    expect((await run("call", { authorization: "Bearer nope" })).status).toBe(401);
    expect(store.count()).toBe(0);
  });

  it("plays each kind of delivery through the real webhook", async () => {
    const { run, store } = setup();

    expect(await outcome(await run("call"))).toEqual(["call", 201, "created"]);
    expect(store.count()).toBe(1);
    expect(await outcome(await run("duplicate"))).toEqual(["duplicate", 200, "duplicate"]);
    expect(store.count()).toBe(1);
    expect(await outcome(await run("invalid"))).toEqual(["invalid", 422, "invalid"]);
    expect(await outcome(await run("unsigned"))).toEqual(["unsigned", 401, "unauthorized"]);
    expect(store.count()).toBe(1);
  });

  it("falls back to a new call when asked for a duplicate with nothing to repeat", async () => {
    expect(await outcome(await setup().run("duplicate"))).toEqual(["call", 201, "created"]);
  });

  it("defaults to a new call", async () => {
    const store = new CallStore(":memory:");
    const simulator = new Simulator({ secret: SECRET, seed: 1, deliver: deliverToWebhook({ store, secret: SECRET }) });
    const request = new Request("http://localhost/api/demo/simulate", { method: "POST", headers: auth });
    const response = await handleSimulate(request, { demo: true, token: DASHBOARD_TOKEN, simulator: () => simulator });

    expect(((await response.json()) as { kind: string }).kind).toBe("call");
    expect(store.count()).toBe(1);
  });

  it.each(["explode", "", "CALL", "call;drop"])("422s the unknown kind %j", async (kind) => {
    expect((await setup().run(kind)).status).toBe(422);
  });
});
