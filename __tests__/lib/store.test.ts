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

describe("CallStore queries", () => {
  it("lists calls newest first and only since the cutoff", () => {
    const store = new CallStore(":memory:");
    store.save({ ...call, callId: "a", phone: "+15550100001" }, { at: "2026-11-01T10:00:00.000Z" });
    store.save({ ...call, callId: "b", phone: "+15550100002" }, { at: "2026-11-03T10:00:00.000Z" });
    store.save({ ...call, callId: "c", phone: "+15550100003" }, { at: "2026-11-02T10:00:00.000Z" });

    expect(store.callsSince("2026-10-01T00:00:00Z").map((c) => c.callId)).toEqual(["b", "c", "a"]);
    expect(store.callsSince("2026-11-02T00:00:00Z").map((c) => c.callId)).toEqual(["b", "c"]);
  });

  it("breaks ties between calls received at the same instant by insertion order", () => {
    const store = new CallStore(":memory:");
    const at = "2026-11-01T10:00:00.000Z";
    store.save({ ...call, callId: "first", phone: "+15550100001" }, { at });
    store.save({ ...call, callId: "second", phone: "+15550100002" }, { at });
    expect(store.callsSince("2026-10-01T00:00:00Z").map((c) => c.callId)).toEqual(["second", "first"]);
  });

  it("respects the limit", () => {
    const store = new CallStore(":memory:");
    for (let i = 0; i < 5; i++) store.save({ ...call, callId: `c${i}`, phone: `+1555010010${i}` });
    expect(store.callsSince("2000-01-01T00:00:00Z", 3)).toHaveLength(3);
  });
});

describe("CallStore events", () => {
  it("records outcomes newest first", () => {
    const store = new CallStore(":memory:");
    store.recordEvent({ outcome: "created" });
    store.recordEvent({ outcome: "invalid" });
    expect(store.recentEvents(10).map((e) => e.outcome)).toEqual(["invalid", "created"]);
  });

  it("joins an event to its call, and leaves refused ones without a call", () => {
    const store = new CallStore(":memory:");
    const { id } = store.save(call);
    store.recordEvent({ outcome: "duplicate", callRef: id, matchedOn: "slot" });
    store.recordEvent({ outcome: "unauthorized" });

    const [refused, duplicate] = store.recentEvents(10);
    expect(refused?.call).toBeNull();
    expect(duplicate).toMatchObject({ matchedOn: "slot", call: { callerName: "Jane Sample", reason: "Check-up" } });
  });

  it("rejects an outcome the table does not know", () => {
    const store = new CallStore(":memory:");
    expect(() => store.recordEvent({ outcome: "exploded" as never })).toThrow();
  });

  it("prunes old events so a flood cannot grow the table forever", () => {
    const store = new CallStore(":memory:");
    for (let i = 0; i < 20_050; i++) store.recordEvent({ outcome: "unauthorized" });
    expect(store.eventsSince("1970-01-01T00:00:00Z")).toHaveLength(20_000);
  });

  it("filters events by time", () => {
    const store = new CallStore(":memory:");
    store.recordEvent({ outcome: "created", at: "2026-11-01T00:00:00.000Z" });
    store.recordEvent({ outcome: "created", at: "2026-11-03T00:00:00.000Z" });
    expect(store.eventsSince("2026-11-02T00:00:00Z")).toHaveLength(1);
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
