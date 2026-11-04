import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { handleCallSummary } from "@/lib/handlers/call-summary";
import { sign, SIGNATURE_HEADER } from "@/lib/signature";
import { CallStore } from "@/lib/store";
import { SECRET, setup, validPayload, webhookRequest, without } from "../helpers";

describe("storing a call", () => {
  it("creates a record and stores the normalised values", async () => {
    const { post, store } = setup();
    const res = await post({ ...validPayload, caller_name: "  Jane   Sample", phone: "555-010-0123" });

    expect(res.status).toBe(201);
    expect(res.json.status).toBe("created");
    expect(store.count()).toBe(1);
    expect(store.get(res.json.id!)).toMatchObject({
      callId: "call_sample_0001",
      callerName: "Jane Sample",
      phone: "+15550100123",
      reason: "Would like to book a routine check-up.",
      requestedTime: "2026-11-10T14:00:00.000Z",
    });
  });

  it("stores calls that have no call_id", async () => {
    const { post, store } = setup();
    const withoutId = without(validPayload, "call_id");
    expect((await post(withoutId)).status).toBe(201);
    expect((await post({ ...withoutId, phone: "(555) 010-0124" })).status).toBe(201);
    expect(store.count()).toBe(2);
  });

  it("keeps separate records for different people, or the same person at different times", async () => {
    const { post, store } = setup();
    expect((await post(validPayload)).status).toBe(201);
    expect((await post({ ...validPayload, call_id: "call_sample_0002", phone: "(555) 010-0199" })).status).toBe(201);
    expect((await post({ ...validPayload, call_id: "call_sample_0003", requested_time: "2026-11-10T10:00:00-05:00" })).status).toBe(201);
    expect(store.count()).toBe(3);
  });

  it("ignores extra fields in the payload", async () => {
    const { post, store } = setup();
    const res = await post({ ...validPayload, transcript: "full transcript", patient_id: "123" });
    expect(res.status).toBe(201);
    expect(JSON.stringify(store.get(res.json.id!))).not.toMatch(/transcript|patient_id/);
  });

  it("answers JSON", async () => {
    const response = await handleCallSummary(webhookRequest(validPayload), setup().deps);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("duplicate prevention", () => {
  it("answers a byte-identical replay with 200 and the original id", async () => {
    const { post, store } = setup();
    const first = await post(validPayload);
    const replay = await post(validPayload);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.json).toEqual({ status: "duplicate", id: first.json.id, matched_on: "call_id" });
    expect(store.count()).toBe(1);
  });

  it("matches on call_id even when the rest of the payload differs", async () => {
    const { post, store } = setup();
    const first = await post(validPayload);
    const retry = await post({ ...validPayload, reason: "Reworded summary.", phone: "(555) 010-0199", requested_time: "2026-12-01T09:00:00Z" });

    expect(retry.status).toBe(200);
    expect(retry.json.matched_on).toBe("call_id");
    expect(retry.json.id).toBe(first.json.id);
    expect(store.count()).toBe(1);
  });

  it("matches the same phone and slot however they are written", async () => {
    const { post, store } = setup();
    const first = await post({ ...validPayload, call_id: undefined });
    const again = await post({
      call_id: "call_sample_0002",
      caller_name: "Jayne Sampel",
      phone: "+1 555 010 0123",
      reason: "Check-up please.",
      requested_time: "2026-11-10T14:00:00Z",
    });

    expect(again.status).toBe(200);
    expect(again.json.matched_on).toBe("slot");
    expect(again.json.id).toBe(first.json.id);
    expect(store.count()).toBe(1);
  });

  it("does not treat the same name at another time as a duplicate", async () => {
    const { post } = setup();
    await post(validPayload);
    const other = await post({ ...validPayload, call_id: "call_sample_0002", requested_time: "2026-11-10T09:30:00-05:00" });
    expect(other.status).toBe(201);
  });

  it("stores only one of many simultaneous identical deliveries", async () => {
    const { post, store } = setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => post(validPayload)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(19);
    expect(new Set(results.map((r) => r.json.id)).size).toBe(1);
    expect(store.count()).toBe(1);
  });

  it("stores only one when the same slot arrives under different call ids at once", async () => {
    const { post, store } = setup();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => post({ ...validPayload, call_id: `call_${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(store.count()).toBe(1);
  });

  it("keeps rejecting duplicates after a restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "call-summary-"));
    const path = join(dir, "calls.db");
    try {
      const first = new CallStore(path);
      const created = await handleCallSummary(webhookRequest(validPayload), { store: first, secret: SECRET });
      const { id } = (await created.json()) as { id: string };
      first.close();

      const reopened = new CallStore(path);
      const replay = await handleCallSummary(webhookRequest(validPayload), { store: reopened, secret: SECRET });
      expect(replay.status).toBe(200);
      expect(((await replay.json()) as { id: string }).id).toBe(id);
      expect(reopened.count()).toBe(1);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("rejecting bad requests", () => {
  it("401s a missing, wrong or mismatched signature and stores nothing", async () => {
    const { post, store } = setup();
    const raw = JSON.stringify(validPayload);

    for (const signature of [null, "", "sha256=deadbeef", sign(raw, "some-other-secret"), sign(raw + " ", SECRET), raw]) {
      const res = await post(validPayload, { signature });
      expect(res.status, JSON.stringify(signature)).toBe(401);
      expect(res.json.status).toBe("unauthorized");
    }
    expect(store.count()).toBe(0);
  });

  it("checks the signature before the body is parsed", async () => {
    const { post } = setup();
    const res = await post("{not json", { signature: "sha256=00" });
    expect(res.status).toBe(401);
  });

  it("401s an empty body with no signature", async () => {
    const { deps } = setup();
    const response = await handleCallSummary(new Request("http://localhost/x", { method: "POST" }), deps);
    expect(response.status).toBe(401);
  });

  it("accepts the signature header in any letter case", async () => {
    const { deps } = setup();
    const raw = JSON.stringify(validPayload);
    const request = new Request("http://localhost/x", { method: "POST", headers: { "X-Webhook-Signature": sign(raw, SECRET) }, body: raw });
    expect((await handleCallSummary(request, deps)).status).toBe(201);
  });

  it("400s a signed body that is not JSON", async () => {
    const { post, store } = setup();
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(res.json.status).toBe("invalid_json");
    expect(store.count()).toBe(0);
  });

  it("400s a signed empty body", async () => {
    const { post } = setup();
    expect((await post("")).status).toBe(400);
  });

  it("422s JSON that is not an object", async () => {
    const { post } = setup();
    for (const body of ["[]", "null", '"text"', "42"]) {
      const res = await post(body);
      expect(res.status, body).toBe(422);
      expect(res.json.errors?.map((e) => e.field)).toEqual(["(body)"]);
    }
  });

  it("422s an invalid payload, listing each bad field, and stores nothing", async () => {
    const { post, store } = setup();
    const res = await post({ ...validPayload, caller_name: "", phone: "nope", requested_time: "tomorrow" });

    expect(res.status).toBe(422);
    expect(res.json.status).toBe("invalid");
    expect(res.json.errors?.map((e) => e.field).sort()).toEqual(["caller_name", "phone", "requested_time"]);
    expect(store.count()).toBe(0);
  });

  it("does not store a call that was rejected and later retried correctly twice", async () => {
    const { post, store } = setup();
    await post({ ...validPayload, phone: "nope" });
    expect((await post(validPayload)).status).toBe(201);
    expect((await post(validPayload)).status).toBe(200);
    expect(store.count()).toBe(1);
  });

  it("does not echo caller data back in the error response", async () => {
    const { post } = setup();
    const res = await post({ ...validPayload, phone: "SECRET-PHONE-VALUE" });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.json)).not.toMatch(/SECRET-PHONE-VALUE/);
  });

  it("413s a body over the size limit and stores nothing", async () => {
    const { post, store } = setup({ maxBodyBytes: 512 });
    const res = await post({ ...validPayload, reason: "x".repeat(2000) });
    expect(res.status).toBe(413);
    expect(res.json.status).toBe("too_large");
    expect(store.count()).toBe(0);
  });

  it("413s before checking the signature, so an oversized unsigned body is never buffered", async () => {
    const { post } = setup({ maxBodyBytes: 512 });
    expect((await post({ big: "x".repeat(2000) }, { signature: null })).status).toBe(413);
  });

  it("verifies the signature over the raw bytes, not a re-encoded string", async () => {
    const { deps, store } = setup();
    const bytes = Buffer.concat([Buffer.from('{"caller_name":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
    const request = new Request("http://localhost/x", { method: "POST", headers: { [SIGNATURE_HEADER]: sign(bytes, SECRET) }, body: bytes });
    const response = await handleCallSummary(request, deps);
    expect(response.status).toBe(422);
    expect(store.count()).toBe(0);
  });
});

describe("failures on our side", () => {
  it("returns 500, so the sender retries, when storage fails, without leaking details", async () => {
    const { store, deps } = setup();
    store.close();
    const response = await handleCallSummary(webhookRequest(validPayload), deps);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ status: "error" });
  });

  it("keeps a delivery's 2xx even if event bookkeeping fails", async () => {
    const { post, store } = setup();
    store.recordEvent = () => {
      throw new Error("disk full");
    };
    const res = await post(validPayload);
    expect(res.status).toBe(201);
    expect(store.count()).toBe(1);
  });
});

describe("events and logging", () => {
  it("records one event per delivery, whatever happened to it", async () => {
    const { post, store } = setup();
    await post(validPayload);
    await post(validPayload);
    await post({ ...validPayload, phone: "nope" });
    await post("{not json");
    await post(validPayload, { signature: "sha256=00" });

    expect(store.recentEvents(10).map((e) => e.outcome)).toEqual(["unauthorized", "invalid", "invalid", "duplicate", "created"]);
  });

  it("links created and duplicate events to the call, and refused ones to nothing", async () => {
    const { post, store } = setup();
    await post(validPayload);
    await post(validPayload);
    await post({ ...validPayload, reason: "" });

    const [refused, duplicate, created] = store.recentEvents(3);
    expect(refused?.call).toBeNull();
    expect(duplicate).toMatchObject({ matchedOn: "call_id", call: { callerName: "Jane Sample" } });
    expect(created?.call?.callerName).toBe("Jane Sample");
  });

  it("does not record an event for an oversized body", async () => {
    const { post, store } = setup({ maxBodyBytes: 100 });
    await post({ ...validPayload, reason: "x".repeat(500) });
    expect(store.recentEvents(10)).toEqual([]);
  });

  it("never logs caller data", async () => {
    const log = vi.fn();
    const { post } = setup({ log });
    await post(validPayload);
    await post(validPayload);
    await post({ ...validPayload, phone: "nope" });

    expect(log).toHaveBeenCalledTimes(3);
    for (const [entry] of log.mock.calls) expect(JSON.stringify(entry)).not.toMatch(/Jane|Sample|check-up|nope|\(555\)|0100123/i);
  });

  it("logs which fields failed, not their values", async () => {
    const log = vi.fn();
    const { post } = setup({ log });
    await post({ ...validPayload, phone: "nope", reason: "" });
    expect(log).toHaveBeenCalledWith({ event: "call_summary", outcome: "invalid", fields: ["phone", "reason"] });
  });
});
