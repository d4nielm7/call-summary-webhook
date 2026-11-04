import { describe, expect, it } from "vitest";
import { formatTime, prettyJson } from "@/components/format";

describe("formatTime", () => {
  it("writes the weekday, date and time in the given timezone", () => {
    expect(formatTime("2026-11-10T14:00:00.000Z", "America/New_York")).toBe("Tue, Nov 10, 9:00 AM");
    expect(formatTime("2026-11-10T14:00:00.000Z", "Asia/Tokyo")).toBe("Tue, Nov 10, 11:00 PM");
  });

  it("rolls the date over with the timezone", () => {
    expect(formatTime("2026-11-10T23:30:00.000Z", "Asia/Tokyo")).toBe("Wed, Nov 11, 8:30 AM");
  });

  it("handles noon and midnight", () => {
    expect(formatTime("2026-11-10T12:00:00.000Z", "UTC")).toContain("12:00 PM");
    expect(formatTime("2026-11-10T00:00:00.000Z", "UTC")).toContain("12:00 AM");
  });

  it("follows daylight saving", () => {
    expect(formatTime("2026-07-10T13:00:00.000Z", "America/New_York")).toContain("9:00 AM");
    expect(formatTime("2026-12-10T14:00:00.000Z", "America/New_York")).toContain("9:00 AM");
  });

  it("uses a plain space before AM and PM", () => {
    expect(formatTime("2026-11-10T19:15:00.000Z", "UTC")).not.toMatch(/ | /);
  });
});

describe("prettyJson", () => {
  it("indents valid JSON", () => {
    expect(prettyJson('{"a":1,"b":[2]}')).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
  });

  it("returns text that is not JSON as it is", () => {
    expect(prettyJson("{not json")).toBe("{not json");
  });
});
