import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createApp } from "../src/app.ts";
import { buildDashboard } from "../src/dashboard.ts";
import { seedHistory } from "../src/seed.ts";
import { createRng, duplicateOf, invalidCall, randomCall } from "../src/simulator.ts";
import { parseCallSummary } from "../src/schema.ts";
import { CallStore } from "../src/store.ts";
import { DASHBOARD_TOKEN, setup, validPayload } from "./helpers.ts";

const auth = { authorization: `Bearer ${DASHBOARD_TOKEN}` };

function call(overrides: Partial<Parameters<CallStore["save"]>[0]> = {}) {
  const parsed = parseCallSummary({ ...validPayload, call_id: undefined });
  assert.ok(parsed.ok);
  return { ...parsed.value, ...overrides };
}

describe("delivery events", () => {
  it("records one event per delivery, whatever happened to it", async () => {
    const { post, store } = setup();
    await post(validPayload); // created
    await post(validPayload); // duplicate
    await post({ ...validPayload, phone: "nope" }); // invalid
    await post("{not json"); // invalid
    await post(validPayload, { signature: "sha256=00" }); // unauthorized

    const feed = store.recentEvents(10);
    assert.deepEqual(feed.map((e) => e.outcome), ["unauthorized", "invalid", "invalid", "duplicate", "created"]);
  });

  it("links created and duplicate events to the call, and refused ones to nothing", async () => {
    const { post, store } = setup();
    const first = await post(validPayload);
    await post(validPayload);
    await post({ ...validPayload, reason: "" });

    const [refused, duplicate, created] = store.recentEvents(3);
    assert.equal(refused?.call, null);
    assert.equal(duplicate?.matchedOn, "call_id");
    assert.equal(duplicate?.call?.callerName, "Jane Sample");
    assert.equal(created?.call?.callerName, "Jane Sample");
    assert.equal(store.count(), 1);
    assert.ok(first.json.id);
  });

  it("keeps a delivery's 2xx even if bookkeeping fails", async () => {
    const { post, store } = setup();
    store.recordEvent = () => {
      throw new Error("disk full");
    };
    const res = await post(validPayload);
    assert.equal(res.status, 201);
    assert.equal(store.count(), 1);
  });

  it("prunes old events so a flood can't grow the table forever", () => {
    const store = new CallStore(":memory:");
    for (let i = 0; i < 20_050; i++) store.recordEvent({ outcome: "unauthorized" });
    assert.equal(store.eventsSince("1970-01-01T00:00:00Z").length, 20_000);
  });
});

describe("buildDashboard", () => {
  // 10:00 on Tue 3 Nov 2026 in New York (EST; daylight saving ended on Sun 1 Nov).
  const now = new Date("2026-11-03T15:00:00Z");
  const ny = { timeZone: "America/New_York", now };

  function storeWithEvents(events: Array<[string, "created" | "duplicate" | "invalid" | "unauthorized"]>) {
    const store = new CallStore(":memory:");
    for (const [at, outcome] of events) store.recordEvent({ at, outcome });
    return store;
  }

  it("returns exactly N contiguous, zero-filled days ending today, even across the daylight-saving change", () => {
    const { daily } = buildDashboard(new CallStore(":memory:"), { ...ny, days: 7 });
    assert.deepEqual(daily.map((d) => d.date), ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
    assert.ok(daily.every((d) => d.stored === 0 && d.duplicates === 0));
  });

  it("assigns events to the clinic's day, not the UTC day", () => {
    const store = storeWithEvents([
      ["2026-11-03T03:00:00Z", "created"], // 22:00 on Nov 2 in New York
      ["2026-11-03T06:00:00Z", "created"], // 01:00 on Nov 3 in New York
    ]);
    const { daily } = buildDashboard(store, { ...ny, days: 7 });
    assert.equal(daily.find((d) => d.date === "2026-11-02")?.stored, 1);
    assert.equal(daily.find((d) => d.date === "2026-11-03")?.stored, 1);
  });

  it("counts each outcome and the last 24 hours separately, and ignores events outside the window", () => {
    const store = storeWithEvents([
      ["2026-11-03T14:00:00Z", "created"],
      ["2026-11-03T13:00:00Z", "created"],
      ["2026-11-02T12:00:00Z", "created"], // more than 24h before `now`
      ["2026-11-03T12:00:00Z", "duplicate"],
      ["2026-11-03T11:00:00Z", "invalid"],
      ["2026-11-03T10:00:00Z", "unauthorized"],
      ["2026-10-01T12:00:00Z", "created"], // far outside a 7-day window
    ]);
    const { totals } = buildDashboard(store, { ...ny, days: 7 });
    assert.deepEqual(totals, { stored: 3, duplicates: 1, invalid: 1, unauthorized: 1, last_24h: 2 });
  });

  it("scopes calls and requested times to the same window as the counts", () => {
    const store = new CallStore(":memory:");
    store.save(call({ phone: "+15550100111", requestedTime: "2026-11-10T14:00:00.000Z" }), { at: "2026-11-03T14:00:00Z" });
    store.save(call({ phone: "+15550100112", requestedTime: "2026-11-11T14:00:00.000Z" }), { at: "2026-09-01T14:00:00Z" });
    const out = buildDashboard(store, { ...ny, days: 7 });
    assert.equal(out.calls.length, 1);
    assert.deepEqual(out.requested_times, ["2026-11-10T14:00:00.000Z"]);
  });

  it("lists calls newest first", () => {
    const store = new CallStore(":memory:");
    store.save(call({ phone: "+15550100111", requestedTime: "2026-11-10T14:00:00.000Z" }), { at: "2026-11-02T14:00:00Z" });
    store.save(call({ phone: "+15550100112", requestedTime: "2026-11-11T14:00:00.000Z" }), { at: "2026-11-03T14:00:00Z" });
    assert.deepEqual(buildDashboard(store, { ...ny, days: 7 }).calls.map((c) => c.phone), ["+15550100112", "+15550100111"]);
  });

  it("rejects an unknown timezone up front, not on the first request", () => {
    assert.throws(() => createApp({ store: new CallStore(":memory:"), secret: "x".repeat(20), timeZone: "Mars/Olympus" }), /unknown time zone/);
  });
});

describe("GET /api/dashboard", () => {
  it("is switched off (404) when no dashboard token is configured", async () => {
    const { app } = setup();
    assert.equal((await app.request("/api/dashboard", { headers: auth })).status, 404);
  });

  it("401s a missing or wrong token", async () => {
    const { app } = setup({ dashboardToken: DASHBOARD_TOKEN });
    const attempts: Array<Record<string, string>> = [{}, { authorization: "Bearer nope" }, { authorization: DASHBOARD_TOKEN }, { authorization: "Basic abc" }];
    for (const headers of attempts) {
      const res = await app.request("/api/dashboard", { headers });
      assert.equal(res.status, 401, JSON.stringify(headers));
      assert.deepEqual(await res.json(), { status: "unauthorized" });
    }
  });

  it("returns the snapshot, uncached, with the token", async () => {
    const { app, post } = setup({ dashboardToken: DASHBOARD_TOKEN });
    await post(validPayload);
    await post(validPayload);
    const res = await app.request("/api/dashboard?days=7", { headers: auth });
    const body = (await res.json()) as any;

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(body.days, 7);
    assert.equal(body.daily.length, 7);
    assert.equal(body.totals.stored, 1);
    assert.equal(body.totals.duplicates, 1);
    assert.equal(body.calls[0].caller_name, "Jane Sample");
    assert.equal(body.calls[0].phone, "+15550100123");
    assert.equal(body.feed[0].outcome, "duplicate");
  });

  it("only accepts the offered ranges", async () => {
    const { app } = setup({ dashboardToken: DASHBOARD_TOKEN });
    for (const days of ["0", "5", "365", "abc", "-7"]) {
      assert.equal((await app.request(`/api/dashboard?days=${days}`, { headers: auth })).status, 422, days);
    }
    assert.equal((await app.request("/api/dashboard", { headers: auth })).status, 200); // default range
  });
});

describe("POST /api/demo/simulate", () => {
  const simulate = (app: ReturnType<typeof setup>["app"], kind: string, headers: Record<string, string> = auth) =>
    app.request(`/api/demo/simulate?kind=${kind}`, { method: "POST", headers });

  it("does not exist unless demo mode is on", async () => {
    const { app } = setup({ dashboardToken: DASHBOARD_TOKEN });
    assert.equal((await simulate(app, "call")).status, 404);
  });

  it("needs the dashboard token", async () => {
    const { app, store } = setup({ dashboardToken: DASHBOARD_TOKEN, demo: true });
    assert.equal((await simulate(app, "call", {})).status, 401);
    assert.equal(store.count(), 0);
  });

  it("plays each kind of delivery through the real pipeline", async () => {
    const { app, store } = setup({ dashboardToken: DASHBOARD_TOKEN, demo: true });
    const outcome = async (kind: string) => {
      const body = (await (await simulate(app, kind)).json()) as any;
      return [body.status, body.result.status];
    };

    assert.deepEqual(await outcome("call"), [201, "created"]);
    assert.equal(store.count(), 1);
    assert.deepEqual(await outcome("duplicate"), [200, "duplicate"]);
    assert.equal(store.count(), 1);
    assert.deepEqual(await outcome("invalid"), [422, "invalid"]);
    assert.deepEqual(await outcome("unsigned"), [401, "unauthorized"]);
    assert.equal(store.count(), 1);
  });

  it("falls back to a new call when asked for a duplicate with nothing to repeat", async () => {
    const { app } = setup({ dashboardToken: DASHBOARD_TOKEN, demo: true });
    const body = (await (await simulate(app, "duplicate")).json()) as any;
    assert.equal(body.kind, "call");
    assert.equal(body.status, 201);
  });

  it("rejects an unknown kind", async () => {
    const { app } = setup({ dashboardToken: DASHBOARD_TOKEN, demo: true });
    assert.equal((await simulate(app, "explode")).status, 422);
  });
});

describe("dashboard page and assets", () => {
  it("serves the page with a locked-down content security policy", async () => {
    const { app } = setup();
    const res = await app.request("/");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const csp = res.headers.get("content-security-policy") ?? "";
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  it("serves the script, stylesheet and fonts", async () => {
    const { app } = setup();
    for (const [path, type] of [["/dashboard.js", /javascript/], ["/dashboard.css", /css/], ["/fonts/geist.woff2", /woff2/], ["/fonts/geist-mono.woff2", /woff2/]] as const) {
      const res = await app.request(path);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get("content-type") ?? "", type, path);
    }
  });

  it("serves nothing outside the allowlist, whatever the path", async () => {
    const { app } = setup();
    for (const path of ["/package.json", "/.env", "/../package.json", "/fonts/../package.json", "/src/store.ts", "/data/calls.db", "/fonts/geist-latin.woff2", "/public/index.html"]) {
      assert.equal((await app.request(path)).status, 404, path);
    }
  });
});

describe("dashboard script", () => {
  it("never builds markup from strings, so caller-supplied text can't become HTML", () => {
    const source = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "") // the header comment mentions innerHTML in order to forbid it
      .replace(/^\s*\/\/.*$/gm, "");
    for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
      assert.ok(!source.includes(banned), `dashboard.js must not use ${banned}`);
    }
  });
});

describe("simulator and seed data", () => {
  const now = new Date("2026-11-03T15:00:00Z");

  it("only ever invents valid calls, from the reserved fictional phone range", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const parsed = parseCallSummary(randomCall(rng, now));
      assert.ok(parsed.ok, `call ${i} failed validation`);
      assert.match(parsed.value.phone, /^\+1\d{3}55501\d{2}$/);
    }
  });

  it("makes duplicates that the store really recognises", () => {
    const rng = createRng(11);
    for (let i = 0; i < 100; i++) {
      const store = new CallStore(":memory:");
      const original = randomCall(rng, now);
      const first = parseCallSummary(original);
      const again = parseCallSummary(duplicateOf(rng, original));
      assert.ok(first.ok && again.ok);
      assert.equal(store.save(first.value).created, true);
      assert.equal(store.save(again.value).created, false, `duplicate ${i} was stored`);
    }
  });

  it("makes invalid calls that the validator really rejects", () => {
    const rng = createRng(13);
    for (let i = 0; i < 200; i++) assert.equal(parseCallSummary(invalidCall(rng, now)).ok, false, `invalid ${i} passed`);
  });

  it("seeds believable, repeatable history", () => {
    const seeded = () => {
      const store = new CallStore(":memory:");
      seedHistory(store, { days: 30, now, seed: 2026 });
      return store;
    };
    const a = buildDashboard(seeded(), { days: 30, timeZone: "America/New_York", now });
    const b = buildDashboard(seeded(), { days: 30, timeZone: "America/New_York", now });

    assert.deepEqual(a.totals, b.totals);
    assert.ok(a.totals.stored > 100, "expected a busy month");
    assert.ok(a.totals.duplicates > 0 && a.totals.invalid > 0 && a.totals.unauthorized > 0, "expected every outcome");
    assert.ok(a.calls.every((c) => /^\+1\d{3}55501\d{2}$/.test(c.phone)));
  });
});
