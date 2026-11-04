import { describe, expect, it } from "vitest";
import { describeFlow, type FlowResult } from "@/lib/flow";

const states = (result: FlowResult | null) => describeFlow(result).map((stage) => stage.state);

describe("describeFlow", () => {
  it("always describes the same four gates in order", () => {
    expect(describeFlow(null).map((s) => s.id)).toEqual(["signature", "validation", "duplicate", "store"]);
    expect(describeFlow({ status: 201, body: {} }).map((s) => s.id)).toEqual(["signature", "validation", "duplicate", "store"]);
  });

  it("is idle before anything is sent, and explains each gate", () => {
    const stages = describeFlow(null);
    expect(stages.map((s) => s.state)).toEqual(["idle", "idle", "idle", "idle"]);
    expect(stages.every((s) => s.note.length > 0)).toBe(true);
  });

  it("passes every gate for a stored call", () => {
    expect(states({ status: 201, body: { status: "created" } })).toEqual(["pass", "pass", "pass", "pass"]);
  });

  it("catches a duplicate at the third gate and writes nothing", () => {
    const stages = describeFlow({ status: 200, body: { status: "duplicate", matched_on: "slot" } });
    expect(stages.map((s) => s.state)).toEqual(["pass", "pass", "caught", "skipped"]);
    expect(stages[2]?.note).toContain("phone and time");
  });

  it("says when a duplicate matched on the call id", () => {
    expect(describeFlow({ status: 200, body: { matched_on: "call_id" } })[2]?.note).toContain("call id");
  });

  it("stops a bad payload at validation and names the fields", () => {
    const stages = describeFlow({ status: 422, body: { errors: [{ field: "phone", message: "x" }, { field: "reason", message: "y" }] } });
    expect(stages.map((s) => s.state)).toEqual(["pass", "stop", "skipped", "skipped"]);
    expect(stages[1]?.note).toContain("phone, reason");
  });

  it("stops a forged signature at the first gate", () => {
    expect(states({ status: 401, body: { status: "unauthorized" } })).toEqual(["stop", "skipped", "skipped", "skipped"]);
  });

  it("stops a body that is not JSON at validation", () => {
    expect(states({ status: 400, body: {} })).toEqual(["pass", "stop", "skipped", "skipped"]);
  });

  it("stops an oversized body at the first gate", () => {
    expect(states({ status: 413, body: {} })).toEqual(["stop", "skipped", "skipped", "skipped"]);
  });

  it("blames storage for a 500", () => {
    const stages = describeFlow({ status: 500, body: {} });
    expect(stages.map((s) => s.state)).toEqual(["skipped", "skipped", "skipped", "stop"]);
    expect(stages[3]?.note).toContain("retry");
  });

  it("never marks a gate after the stopping one as passed", () => {
    for (const status of [401, 400, 413, 422]) {
      const list = states({ status, body: {} });
      const stop = list.indexOf("stop");
      expect(stop).toBeGreaterThanOrEqual(0);
      expect(list.slice(stop + 1).every((state) => state === "skipped")).toBe(true);
    }
  });
});
