import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CallSummary } from "@/lib/schema";
import { CallStore, slotFingerprint } from "@/lib/store";

const call: CallSummary = {
  callId: "call_1",
  callerName: "Jane Sample",
  phone: "+15550100123",
  reason: "Check-up",
  requestedTime: "2026-11-10T14:00:00.000Z",
};

describe("slotFingerprint", () => {
  it("depends on phone and time only", () => {
    expect(slotFingerprint(call)).toBe(slotFingerprint({ ...call, callerName: "Someone Else", reason: "Other" } as CallSummary));
    expect(slotFingerprint(call)).not.toBe(slotFingerprint({ ...call, phone: "+15550100124" }));
    expect(slotFingerprint(call)).not.toBe(slotFingerprint({ ...call, requestedTime: "2026-11-10T15:00:00.000Z" }));
  });

  it("does not confuse a phone/time boundary shift", () => {
    const a = slotFingerprint({ phone: "+1555", requestedTime: "0100|2026" });
    const b = slotFingerprint({ phone: "+15550100", requestedTime: "|2026" });
    expect(a).not.toBe(b);
  });
});

describe("CallStore.save", () => {
  it("stores a new call and returns its id", () => {
    const store = new CallStore(":memory:");
    const result = store.save(call);
    expect(result.created).toBe(true);
    expect(store.get(result.id)).toMatchObject({ callId: "call_1", callerName: "Jane Sample", phone: "+15550100123" });
  });

  it("recognises the same call_id", () => {
    const store = new CallStore(":memory:");
    const first = store.save(call);
    const again = store.save({ ...call, phone: "+15550100999", requestedTime: "2027-01-01T00:00:00.000Z" });
    expect(again).toEqual({ created: false, id: first.id, matchedOn: "call_id" });
    expect(store.count()).toBe(1);
  });

  it("recognises the same phone and slot under a different call_id", () => {
    const store = new CallStore(":memory:");
    const first = store.save(call);
    const again = store.save({ ...call, callId: "call_2", callerName: "Jayne" });
    expect(again).toEqual({ created: false, id: first.id, matchedOn: "slot" });
  });

  it("prefers call_id over slot when both match", () => {
    const store = new CallStore(":memory:");
    store.save(call);
    expect(store.save(call)).toMatchObject({ created: false, matchedOn: "call_id" });
  });

  it("recognises a duplicate that has no call_id on either side", () => {
    const store = new CallStore(":memory:");
    store.save({ ...call, callId: null });
    expect(store.save({ ...call, callId: null })).toMatchObject({ created: false, matchedOn: "slot" });
  });

  it("allows any number of calls without a call_id", () => {
    const store = new CallStore(":memory:");
    for (let i = 0; i < 5; i++) store.save({ ...call, callId: null, phone: `+1555010010${i}` });
    expect(store.count()).toBe(5);
  });

  it("keeps two different people asking for the same time", () => {
    const store = new CallStore(":memory:");
    store.save(call);
    expect(store.save({ ...call, callId: "call_2", phone: "+15550100124" }).created).toBe(true);
  });

  it("keeps the same person asking for two different times", () => {
    const store = new CallStore(":memory:");
    store.save(call);
    expect(store.save({ ...call, callId: "call_2", requestedTime: "2026-11-11T14:00:00.000Z" }).created).toBe(true);
  });

  it("uses the given received time", () => {
    const store = new CallStore(":memory:");
    const { id } = store.save(call, { at: "2026-11-01T10:00:00.000Z" });
    expect(store.get(id)?.receivedAt).toBe("2026-11-01T10:00:00.000Z");
  });

  it("stores text with quotes and SQL in it as plain text", () => {
    const store = new CallStore(":memory:");
    const reason = `Robert'); DROP TABLE calls;-- "quoted" 🙂`;
    const { id } = store.save({ ...call, reason });
    expect(store.get(id)?.reason).toBe(reason);
    expect(store.count()).toBe(1);
  });

  it("returns undefined for an unknown id", () => {
    expect(new CallStore(":memory:").get("nope")).toBeUndefined();
  });
});

describe("CallStore.latest", () => {
  const save = (store: CallStore, id: string, at: string) =>
    store.save({ ...call, callId: id, phone: `+1555010${id.padStart(4, "0")}` }, { at });

  it("lists the newest calls first", () => {
    const store = new CallStore(":memory:");
    save(store, "1", "2026-11-01T10:00:00.000Z");
    save(store, "2", "2026-11-03T10:00:00.000Z");
    save(store, "3", "2026-11-02T10:00:00.000Z");
    expect(store.latest(10).map((c) => c.callId)).toEqual(["2", "3", "1"]);
  });

  it("breaks ties between calls received at the same instant by insertion order", () => {
    const store = new CallStore(":memory:");
    const at = "2026-11-01T10:00:00.000Z";
    save(store, "1", at);
    save(store, "2", at);
    expect(store.latest(10).map((c) => c.callId)).toEqual(["2", "1"]);
  });

  it("respects the limit", () => {
    const store = new CallStore(":memory:");
    for (let i = 1; i <= 5; i++) save(store, String(i), "2026-11-01T10:00:00.000Z");
    expect(store.latest(3)).toHaveLength(3);
  });

  it("is empty for an empty store", () => {
    expect(new CallStore(":memory:").latest(5)).toEqual([]);
  });
});

describe("CallStore.clear", () => {
  it("removes every call", () => {
    const store = new CallStore(":memory:");
    store.save(call);
    store.save({ ...call, callId: "call_2", phone: "+15550100124" });
    store.clear();
    expect(store.count()).toBe(0);
    expect(store.latest(10)).toEqual([]);
  });

  it("forgets what it had seen, so the same call is stored again", () => {
    const store = new CallStore(":memory:");
    store.save(call);
    store.clear();
    expect(store.save(call).created).toBe(true);
  });
});

describe("CallStore on disk", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("creates missing folders and keeps data across a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "call-store-"));
    dirs.push(dir);
    const path = join(dir, "nested", "calls.db");

    const first = new CallStore(path);
    const { id } = first.save(call);
    first.close();

    const reopened = new CallStore(path);
    expect(reopened.get(id)?.callerName).toBe("Jane Sample");
    expect(reopened.save(call)).toMatchObject({ created: false, id });
    reopened.close();
  });
});
