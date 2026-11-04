import { describe, expect, it } from "vitest";
import { normalizePhone, parseCallSummary } from "@/lib/schema";
import { validPayload, without } from "../helpers";

describe("normalizePhone", () => {
  it.each([
    ["(555) 010-0123", "+15550100123"],
    ["555-010-0123", "+15550100123"],
    ["555.010.0123", "+15550100123"],
    ["5550100123", "+15550100123"],
    ["1 555 010 0123", "+15550100123"],
    ["1-555-010-0123", "+15550100123"],
    ["+1 (555) 010-0123", "+15550100123"],
    ["+44 20 7946 0958", "+442079460958"],
    ["+81 3-1234-5678", "+81312345678"],
    ["  +15550100123  ", "+15550100123"],
  ])("accepts %j as %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    "",
    "abc",
    "555-0123",
    "5550100",
    "0555010012",
    "1555010012",
    "123456789012345678",
    "+0 555 010 0123",
    "+1234567",
    "555-010-0123 ext 4",
    "++15550100123",
    "+1 555 010 0123 +",
    "(555) 010-0123; DROP TABLE calls",
    "５５５０１００１２３",
  ])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it("gives the same number for every way of writing it", () => {
    const forms = ["(555) 010-0123", "555.010.0123", "+1 555 010 0123", "1 (555) 010-0123"];
    expect(new Set(forms.map(normalizePhone)).size).toBe(1);
  });
});

describe("parseCallSummary", () => {
  const errorFields = (body: unknown) => {
    const result = parseCallSummary(body);
    expect(result.ok).toBe(false);
    return result.ok ? [] : result.errors.map((e) => e.field);
  };

  it("accepts a valid payload and normalises every field", () => {
    const result = parseCallSummary({ ...validPayload, caller_name: "  Jane    Sample ", phone: "555-010-0123", requested_time: "2026-11-10T09:00:00-05:00" });
    expect(result).toEqual({
      ok: true,
      value: {
        callId: "call_sample_0001",
        callerName: "Jane Sample",
        phone: "+15550100123",
        reason: "Would like to book a routine check-up.",
        requestedTime: "2026-11-10T14:00:00.000Z",
      },
    });
  });

  it("treats call_id as optional", () => {
    const result = parseCallSummary(without(validPayload, "call_id"));
    expect(result.ok && result.value.callId).toBeNull();
  });

  it("trims call_id and the reason", () => {
    const result = parseCallSummary({ ...validPayload, call_id: "  abc  ", reason: "  needs a slot \n" });
    expect(result.ok && [result.value.callId, result.value.reason]).toEqual(["abc", "needs a slot"]);
  });

  it("rejects an empty or blank call_id instead of treating it as missing", () => {
    expect(errorFields({ ...validPayload, call_id: "" })).toEqual(["call_id"]);
    expect(errorFields({ ...validPayload, call_id: "   " })).toEqual(["call_id"]);
  });

  it("ignores unknown fields instead of failing or storing them", () => {
    const result = parseCallSummary({ ...validPayload, transcript: "...", sentiment: "positive" });
    expect(result.ok && Object.keys(result.value).sort()).toEqual(["callId", "callerName", "phone", "reason", "requestedTime"]);
  });

  it("reports every missing required field at once", () => {
    expect(errorFields({}).sort()).toEqual(["caller_name", "phone", "reason", "requested_time"]);
  });

  it.each([null, "text", 42, true, [], [validPayload]])("rejects a body that is not an object: %j", (body) => {
    expect(errorFields(body)).toEqual(["(body)"]);
  });

  it("rejects empty and whitespace-only text fields", () => {
    expect(errorFields({ ...validPayload, caller_name: "   ", reason: "" }).sort()).toEqual(["caller_name", "reason"]);
  });

  it("rejects non-string values", () => {
    expect(errorFields({ ...validPayload, caller_name: 123, phone: 5550100123, reason: { text: "x" } }).sort()).toEqual(["caller_name", "phone", "reason"]);
    expect(errorFields({ ...validPayload, requested_time: 1_780_000_000 })).toEqual(["requested_time"]);
    expect(errorFields({ ...validPayload, call_id: 7 })).toEqual(["call_id"]);
  });

  it("rejects null for required fields", () => {
    expect(errorFields({ ...validPayload, caller_name: null, phone: null }).sort()).toEqual(["caller_name", "phone"]);
  });

  it("collapses runs of whitespace in the caller name", () => {
    const result = parseCallSummary({ ...validPayload, caller_name: "Jane \t  Q.\n Sample" });
    expect(result.ok && result.value.callerName).toBe("Jane Q. Sample");
  });

  describe("length limits", () => {
    it("accepts the longest allowed values", () => {
      const result = parseCallSummary({ ...validPayload, caller_name: "x".repeat(100), reason: "y".repeat(1000), call_id: "z".repeat(128) });
      expect(result.ok).toBe(true);
    });

    it("rejects one character more", () => {
      expect(errorFields({ ...validPayload, caller_name: "x".repeat(101) })).toEqual(["caller_name"]);
      expect(errorFields({ ...validPayload, reason: "x".repeat(1001) })).toEqual(["reason"]);
      expect(errorFields({ ...validPayload, call_id: "x".repeat(129) })).toEqual(["call_id"]);
    });
  });

  describe("requested_time", () => {
    it.each([
      ["2026-11-10T14:00:00Z", "2026-11-10T14:00:00.000Z"],
      ["2026-11-10T09:00:00-05:00", "2026-11-10T14:00:00.000Z"],
      ["2026-11-10T15:00:00+01:00", "2026-11-10T14:00:00.000Z"],
      ["2026-11-10T14:00:00.5Z", "2026-11-10T14:00:00.500Z"],
      ["2028-02-29T10:00:00Z", "2028-02-29T10:00:00.000Z"],
      ["2000-01-01T00:00:00Z", "2000-01-01T00:00:00.000Z"],
      ["2099-12-31T23:59:59Z", "2099-12-31T23:59:59.000Z"],
    ])("accepts %s and stores %s", (input, expected) => {
      const result = parseCallSummary({ ...validPayload, requested_time: input });
      expect(result.ok && result.value.requestedTime).toBe(expected);
    });

    it("turns the same instant written two ways into the same stored value", () => {
      const a = parseCallSummary({ ...validPayload, requested_time: "2026-11-10T09:00:00-05:00" });
      const b = parseCallSummary({ ...validPayload, requested_time: "2026-11-10T14:00:00Z" });
      expect(a.ok && b.ok && a.value.requestedTime === b.value.requestedTime).toBe(true);
    });

    it.each([
      ["no timezone", "2026-11-10T09:00:00"],
      ["date only", "2026-11-10"],
      ["free text", "tomorrow at 3pm"],
      ["no such day", "2026-02-30T10:00:00Z"],
      ["not a leap year", "2027-02-29T10:00:00Z"],
      ["month 13", "2026-13-01T10:00:00Z"],
      ["hour 25", "2026-11-10T25:00:00Z"],
      ["before 2000", "1999-12-31T23:59:59Z"],
      ["from 2100", "2100-01-01T00:00:00Z"],
      ["empty", ""],
    ])("rejects %s (%j) with exactly one error", (_name, input) => {
      expect(errorFields({ ...validPayload, requested_time: input })).toEqual(["requested_time"]);
    });
  });

  it("never echoes submitted values in error messages", () => {
    const result = parseCallSummary({ ...validPayload, caller_name: "", phone: "SECRET-PHONE-VALUE", requested_time: "SECRET-TIME-VALUE", reason: 5 });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/SECRET-/);
  });
});
