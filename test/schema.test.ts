import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePhone, parseCallSummary } from "../src/schema.ts";
import { validPayload } from "./helpers.ts";

describe("normalizePhone", () => {
  const accepted: Array<[string, string]> = [
    ["(555) 010-0123", "+15550100123"],
    ["555-010-0123", "+15550100123"],
    ["555.010.0123", "+15550100123"],
    ["1 555 010 0123", "+15550100123"],
    ["+1 (555) 010-0123", "+15550100123"],
    ["+44 20 7946 0958", "+442079460958"],
    ["  +15550100123  ", "+15550100123"],
  ];
  for (const [input, expected] of accepted) {
    it(`accepts ${JSON.stringify(input)} as ${expected}`, () => {
      assert.equal(normalizePhone(input), expected);
    });
  }

  const rejected = ["", "abc", "555-0123", "5550100", "0555010012", "123456789012345678", "+0 555 010 0123", "555-010-0123 ext 4", "++15550100123", "+1 555 010 0123 +", "(555) 010-0123; DROP TABLE calls"];
  for (const input of rejected) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      assert.equal(normalizePhone(input), null);
    });
  }
});

describe("parseCallSummary", () => {
  function errorFields(body: unknown): string[] {
    const result = parseCallSummary(body);
    assert.equal(result.ok, false, "expected validation to fail");
    return result.ok ? [] : result.errors.map((e) => e.field);
  }

  it("accepts a valid payload and normalises every field", () => {
    const result = parseCallSummary({
      ...validPayload,
      caller_name: "  Jane    Sample ",
      phone: "555-010-0123",
      requested_time: "2026-11-10T09:00:00-05:00",
    });
    assert.deepEqual(result, {
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
    const { call_id: _omitted, ...withoutId } = validPayload;
    const result = parseCallSummary(withoutId);
    assert.equal(result.ok && result.value.callId, null);
  });

  it("ignores unknown fields instead of failing or storing them", () => {
    const result = parseCallSummary({ ...validPayload, transcript: "...", sentiment: "positive" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && Object.keys(result.value).sort(), ["callId", "callerName", "phone", "reason", "requestedTime"]);
  });

  it("reports every missing required field at once", () => {
    assert.deepEqual(errorFields({}).sort(), ["caller_name", "phone", "reason", "requested_time"]);
  });

  it("rejects bodies that are not objects", () => {
    for (const body of [null, "text", 42, [], [validPayload]]) {
      assert.deepEqual(errorFields(body), ["(body)"]);
    }
  });

  it("rejects empty and whitespace-only text fields", () => {
    assert.deepEqual(errorFields({ ...validPayload, caller_name: "   ", reason: "" }).sort(), ["caller_name", "reason"]);
  });

  it("rejects non-string values", () => {
    assert.deepEqual(errorFields({ ...validPayload, caller_name: 123, phone: 5550100123, reason: { text: "x" } }).sort(), ["caller_name", "phone", "reason"]);
  });

  it("enforces length limits", () => {
    assert.deepEqual(errorFields({ ...validPayload, caller_name: "x".repeat(101) }), ["caller_name"]);
    assert.deepEqual(errorFields({ ...validPayload, reason: "x".repeat(1001) }), ["reason"]);
    assert.deepEqual(errorFields({ ...validPayload, call_id: "x".repeat(129) }), ["call_id"]);
  });

  it("rejects an invalid phone number", () => {
    assert.deepEqual(errorFields({ ...validPayload, phone: "not a phone" }), ["phone"]);
  });

  describe("requested_time", () => {
    it("accepts Z and numeric offsets, and converts both to UTC", () => {
      for (const [input, expected] of [
        ["2026-11-10T14:00:00Z", "2026-11-10T14:00:00.000Z"],
        ["2026-11-10T09:00:00-05:00", "2026-11-10T14:00:00.000Z"],
        ["2026-11-10T15:00:00+01:00", "2026-11-10T14:00:00.000Z"],
        ["2026-11-10T14:00:00.5Z", "2026-11-10T14:00:00.500Z"],
      ] as const) {
        const result = parseCallSummary({ ...validPayload, requested_time: input });
        assert.equal(result.ok && result.value.requestedTime, expected, input);
      }
    });

    it("rejects times that are ambiguous, malformed or impossible", () => {
      for (const input of [
        "2026-11-10T09:00:00", // no timezone
        "2026-11-10", // date only
        "tomorrow at 3pm",
        "2026-02-30T10:00:00Z", // no such day
        "2026-13-01T10:00:00Z",
        "2026-11-10T25:00:00Z",
        "1999-12-31T23:59:59Z", // outside the sanity window
        "2100-01-01T00:00:00Z",
        "",
      ]) {
        assert.deepEqual(errorFields({ ...validPayload, requested_time: input }), ["requested_time"], input);
      }
    });
  });

  it("never echoes submitted values in error messages", () => {
    const result = parseCallSummary({ ...validPayload, caller_name: "", phone: "SECRET-PHONE-VALUE", requested_time: "SECRET-TIME-VALUE" });
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /SECRET-/);
  });
});
