import { describe, expect, it } from "vitest";
import type { DashboardResponse } from "@/lib/dashboard";
import { handleDashboard } from "@/lib/handlers/dashboard";
import { CallStore } from "@/lib/store";
import { DASHBOARD_TOKEN, setup, validPayload } from "../helpers";

const auth = { authorization: `Bearer ${DASHBOARD_TOKEN}` };
const request = (query = "", headers: Record<string, string> = auth) => new Request(`http://localhost/api/dashboard${query}`, { headers });
const deps = (store = new CallStore(":memory:"), overrides = {}) => ({ store, token: DASHBOARD_TOKEN, timeZone: "America/New_York", demo: false, ...overrides });

describe("GET /api/dashboard", () => {
  it("is switched off with a 404 when no token is configured", async () => {
    const response = handleDashboard(request(), deps(undefined, { token: undefined }));
    expect(response.status).toBe(404);
  });

  it("does not look at the Authorization header when it is switched off", () => {
    expect(handleDashboard(request("", {}), deps(undefined, { token: undefined })).status).toBe(404);
  });

  it.each([
    ["no header", {}],
    ["wrong token", { authorization: "Bearer nope" }],
    ["no scheme", { authorization: DASHBOARD_TOKEN }],
    ["wrong scheme", { authorization: "Basic abc" }],
  ])("401s %s", async (_name, headers) => {
    const response = handleDashboard(request("", headers), deps());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: "unauthorized" });
  });

  it("401s a wrong token before touching the database", () => {
    const store = new CallStore(":memory:");
    store.close();
    const response = handleDashboard(request("", { authorization: "Bearer nope" }), deps(store));
    expect(response.status).toBe(401);
  });

  it("returns the snapshot, uncached, with the right token", async () => {
    const { post, store } = setup();
    await post(validPayload);
    await post(validPayload);

    const response = handleDashboard(request("?days=7"), deps(store));
    const body = (await response.json()) as DashboardResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.days).toBe(7);
    expect(body.daily).toHaveLength(7);
    expect(body.totals).toMatchObject({ stored: 1, duplicates: 1 });
    expect(body.calls[0]).toMatchObject({ caller_name: "Jane Sample", phone: "+15550100123" });
    expect(body.feed[0]?.outcome).toBe("duplicate");
  });

  it("defaults to 14 days", async () => {
    const body = (await handleDashboard(request(), deps()).json()) as DashboardResponse;
    expect(body.days).toBe(14);
  });

  it.each(["0", "5", "365", "abc", "-7", "7.5", ""])("422s days=%j", async (days) => {
    const response = handleDashboard(request(`?days=${days}`), deps());
    expect(response.status).toBe(422);
    expect(((await response.json()) as { errors: Array<{ field: string }> }).errors[0]?.field).toBe("days");
  });

  it("answers without any token when the dashboard is open", async () => {
    const response = handleDashboard(request("", {}), deps(undefined, { token: undefined, open: true, demo: true }));
    expect(response.status).toBe(200);
  });

  it("still checks the token when one is configured and the dashboard is not open", () => {
    expect(handleDashboard(request("", {}), deps(undefined, { open: false })).status).toBe(401);
  });

  it("tells the page whether demo mode is on", async () => {
    expect(((await handleDashboard(request(), deps()).json()) as DashboardResponse).demo).toBe(false);
    expect(((await handleDashboard(request(), deps(undefined, { demo: true })).json()) as DashboardResponse).demo).toBe(true);
  });

  it("counts days in the configured timezone", async () => {
    const store = new CallStore(":memory:");
    const now = new Date("2026-11-03T15:00:00Z");
    const tokyo = (await handleDashboard(request("?days=7"), { ...deps(store), timeZone: "Asia/Tokyo", now }).json()) as DashboardResponse;
    expect(tokyo.time_zone).toBe("Asia/Tokyo");
    expect(tokyo.daily.at(-1)?.date).toBe("2026-11-04");
  });
});
