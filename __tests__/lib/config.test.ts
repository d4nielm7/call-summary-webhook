import { describe, expect, it } from "vitest";
import { DEMO_SECRET, readConfig } from "@/lib/config";

const SECRET = "x".repeat(16);

describe("readConfig", () => {
  it("needs a webhook secret of at least 16 characters", () => {
    expect(() => readConfig({})).toThrow(/WEBHOOK_SECRET/);
    expect(() => readConfig({ WEBHOOK_SECRET: "short" })).toThrow(/WEBHOOK_SECRET/);
    expect(readConfig({ WEBHOOK_SECRET: SECRET }).secret).toBe(SECRET);
  });

  it("accepts a secret of exactly 16 characters and rejects 15", () => {
    expect(readConfig({ WEBHOOK_SECRET: "a".repeat(16) }).secret).toHaveLength(16);
    expect(() => readConfig({ WEBHOOK_SECRET: "a".repeat(15) })).toThrow();
  });

  it("treats an empty secret as missing", () => {
    expect(() => readConfig({ WEBHOOK_SECRET: "" })).toThrow(/WEBHOOK_SECRET/);
  });

  it("defaults the database path and leaves demo mode off", () => {
    expect(readConfig({ WEBHOOK_SECRET: SECRET })).toEqual({ secret: SECRET, databasePath: "./data/calls.db", demo: false });
  });

  it("takes the database path from the environment", () => {
    expect(readConfig({ WEBHOOK_SECRET: SECRET, DATABASE_PATH: "/tmp/x.db" }).databasePath).toBe("/tmp/x.db");
  });

  describe("demo mode", () => {
    it("fills in a secret and uses a separate database", () => {
      expect(readConfig({ DEMO_MODE: "1" })).toEqual({ secret: DEMO_SECRET, databasePath: "./data/demo.db", demo: true });
    });

    it("lets the environment override the defaults", () => {
      const config = readConfig({ DEMO_MODE: "1", WEBHOOK_SECRET: SECRET, DATABASE_PATH: "/tmp/demo.db" });
      expect(config).toEqual({ secret: SECRET, databasePath: "/tmp/demo.db", demo: true });
    });

    it("is only switched on by DEMO_MODE=1", () => {
      for (const value of ["0", "true", "", undefined]) {
        expect(() => readConfig({ DEMO_MODE: value })).toThrow(/WEBHOOK_SECRET/);
      }
    });
  });
});
