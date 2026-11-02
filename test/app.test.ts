import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createApp } from "../src/app.ts";
import { sign } from "../src/signature.ts";
import { CallStore } from "../src/store.ts";
import { SECRET, setup, validPayload } from "./helpers.ts";

describe("POST /webhooks/call-summary: storing", () => {
  it("creates a record and stores the normalised values", async () => {
    const { post, store } = setup();
    const res = await post({ ...validPayload, caller_name: "  Jane   Sample", phone: "555-010-0123" });

    assert.equal(res.status, 201);
    assert.equal(res.json.status, "created");
    assert.equal(store.count(), 1);

    const stored = store.get(res.json.id);
    assert.ok(stored);
    assert.equal(stored.callId, "call_sample_0001");
    assert.equal(stored.callerName, "Jane Sample");
    assert.equal(stored.phone, "+15550100123");
    assert.equal(stored.reason, "Would like to book a routine check-up.");
    assert.equal(stored.requestedTime, "2026-11-10T14:00:00.000Z");
    assert.ok(!Number.isNaN(Date.parse(stored.receivedAt)));
  });

  it("stores calls that have no call_id", async () => {
    const { post, store } = setup();
    const { call_id: _omitted, ...withoutId } = validPayload;
    const first = await post(withoutId);
    const second = await post({ ...withoutId, phone: "(555) 010-0124" });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(store.count(), 2);
  });

  it("keeps separate records for different people, or the same person at different times", async () => {
    const { post, store } = setup();
    assert.equal((await post(validPayload)).status, 201);
    assert.equal((await post({ ...validPayload, call_id: "call_sample_0002", phone: "(555) 010-0199" })).status, 201);
    assert.equal((await post({ ...validPayload, call_id: "call_sample_0003", requested_time: "2026-11-10T10:00:00-05:00" })).status, 201);
    assert.equal(store.count(), 3);
  });
});

describe("POST /webhooks/call-summary: duplicate prevention", () => {
  it("answers a byte-identical replay with 200 + the original id and stores nothing new", async () => {
    const { post, store } = setup();
    const first = await post(validPayload);
    const replay = await post(validPayload);

    assert.equal(first.status, 201);
    assert.equal(replay.status, 200);
    assert.equal(replay.json.status, "duplicate");
    assert.equal(replay.json.id, first.json.id);
    assert.equal(store.count(), 1);
  });

  it("matches on call_id even when the rest of the payload differs", async () => {
    const { post, store } = setup();
    const first = await post(validPayload);
    const retry = await post({ ...validPayload, reason: "Reworded summary.", phone: "(555) 010-0199", requested_time: "2026-12-01T09:00:00Z" });

    assert.equal(retry.status, 200);
    assert.equal(retry.json.matched_on, "call_id");
    assert.equal(retry.json.id, first.json.id);
    assert.equal(store.count(), 1);
  });

  it("matches the same phone + slot however the phone and time are written", async () => {
    const { post, store } = setup();
    const first = await post({ ...validPayload, call_id: undefined });
    const again = await post({
      call_id: "call_sample_0002", // a second call, so only phone + slot can match
      caller_name: "Jayne Sampel", // different spelling from speech-to-text
      phone: "+1 555 010 0123",
      reason: "Check-up please.", // different wording
      requested_time: "2026-11-10T14:00:00Z", // same instant, different offset
    });

    assert.equal(again.status, 200);
    assert.equal(again.json.matched_on, "slot");
    assert.equal(again.json.id, first.json.id);
    assert.equal(store.count(), 1);
  });

  it("only one of many simultaneous identical deliveries is stored", async () => {
    const { post, store } = setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => post(validPayload)));

    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 200).length, 19);
    assert.equal(new Set(results.map((r) => r.json.id)).size, 1);
    assert.equal(store.count(), 1);
  });

  it("keeps rejecting duplicates after a restart (state is in the database, not in memory)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "call-summary-"));
    const path = join(dir, "calls.db");
    try {
      const first = new CallStore(path);
      const id = (await request(first, validPayload)).json.id;
      first.close();

      const reopened = new CallStore(path);
      const replay = await request(reopened, validPayload);
      assert.equal(replay.status, 200);
      assert.equal(replay.json.id, id);
      assert.equal(reopened.count(), 1);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    async function request(store: CallStore, body: unknown) {
      const raw = JSON.stringify(body);
      const res = await createApp({ store, secret: SECRET }).request("/webhooks/call-summary", {
        method: "POST",
        headers: { "x-webhook-signature": sign(raw, SECRET) },
        body: raw,
      });
      return { status: res.status, json: (await res.json()) as Record<string, any> };
    }
  });
});

describe("POST /webhooks/call-summary: rejecting bad requests", () => {
  it("401s a missing, wrong or mismatched signature and stores nothing", async () => {
    const { post, store } = setup();
    const raw = JSON.stringify(validPayload);

    for (const signature of [null, "", "sha256=deadbeef", sign(raw, "some-other-secret"), sign(raw + " ", SECRET), raw]) {
      const res = await post(validPayload, { signature });
      assert.equal(res.status, 401, `signature ${JSON.stringify(signature)}`);
      assert.equal(res.json.status, "unauthorized");
    }
    assert.equal(store.count(), 0);
  });

  it("400s a signed body that is not JSON", async () => {
    const { post, store } = setup();
    const res = await post("{not json");
    assert.equal(res.status, 400);
    assert.equal(res.json.status, "invalid_json");
    assert.equal(store.count(), 0);
  });

  it("422s an invalid payload, listing each bad field, and stores nothing", async () => {
    const { post, store } = setup();
    const res = await post({ ...validPayload, caller_name: "", phone: "nope", requested_time: "tomorrow" });

    assert.equal(res.status, 422);
    assert.equal(res.json.status, "invalid");
    assert.deepEqual(res.json.errors.map((e: { field: string }) => e.field).sort(), ["caller_name", "phone", "requested_time"]);
    assert.equal(store.count(), 0);
  });

  it("does not echo caller data back in the error response", async () => {
    const { post } = setup();
    const res = await post({ ...validPayload, phone: "SECRET-PHONE-VALUE" });
    assert.equal(res.status, 422);
    assert.doesNotMatch(JSON.stringify(res.json), /SECRET-PHONE-VALUE/);
  });

  it("413s a body over the size limit", async () => {
    const { post, store } = setup({ maxBodyBytes: 512 });
    const res = await post({ ...validPayload, reason: "x".repeat(2000) });
    assert.equal(res.status, 413);
    assert.equal(store.count(), 0);
  });

  it("404s unknown routes and wrong methods with JSON", async () => {
    const { app } = setup();
    const unknown = await app.request("/nope");
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { status: "not_found" });
    assert.equal((await app.request("/webhooks/call-summary")).status, 404);
  });

  it("returns 500 (so the sender retries) when storage fails, without leaking details", async () => {
    const { store } = setup();
    store.close(); // every later query now throws
    const app = createApp({ store, secret: SECRET });
    const raw = JSON.stringify(validPayload);
    const res = await app.request("/webhooks/call-summary", { method: "POST", headers: { "x-webhook-signature": sign(raw, SECRET) }, body: raw });

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { status: "error" });
  });
});

describe("app", () => {
  it("serves /health", async () => {
    const { app } = setup();
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });

  it("refuses to start without a secret", () => {
    assert.throws(() => createApp({ store: new CallStore(":memory:"), secret: "" }), /secret is required/);
  });

  it("never logs caller data", async () => {
    const lines: string[] = [];
    const store = new CallStore(":memory:");
    const app = createApp({ store, secret: SECRET, log: (e) => lines.push(JSON.stringify(e)) });
    const raw = JSON.stringify(validPayload);
    const headers = { "x-webhook-signature": sign(raw, SECRET) };
    await app.request("/webhooks/call-summary", { method: "POST", headers, body: raw });
    await app.request("/webhooks/call-summary", { method: "POST", headers, body: raw });

    assert.equal(lines.length, 2);
    for (const line of lines) assert.doesNotMatch(line, /Jane|555|check-up/i);
  });
});
