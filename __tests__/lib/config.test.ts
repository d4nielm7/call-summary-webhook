import { describe, expect, it } from "vitest";
import { DEMO_SECRET, readConfig } from "@/lib/config";

const SECRET = "x".repeat(16);

describe("readConfig", () => {
  it("needs a webhook secret of at least 16 characters", () => {
    expect(() => readConfig({})).toThrow(/WEBHOOK_SECRET/);
    expect(() => readConfig({ WEBHOOK_SECRET: "short" })).toThrow(/WEBHOOK_SECRET/);
    expect(readConfig({ WEBHOOK_SECRET: SECRET }).secret).toBe(SECRET);
  });

  it("treats an empty secret as missing", () => {
    expect(() => readConfig({ WEBHOOK_SECRET: "" })).toThrow(/WEBHOOK_SECRET/);
  });

  it("keeps the dashboard off unless a token is set", () => {
    expect(readConfig({ WEBHOOK_SECRET: SECRET }).dashboardToken).toBeUndefined();
    expect(readConfig({ WEBHOOK_SECRET: SECRET, DASHBOARD_TOKEN: "" }).dashboardToken).toBeUndefined();
  });

  it("never opens the dashboard outside demo mode, with or without a token", () => {
    expect(readConfig({ WEBHOOK_SECRET: SECRET }).dashboardOpen).toBe(false);
    expect(readConfig({ WEBHOOK_SECRET: SECRET, DASHBOARD_TOKEN: "t".repeat(16) }).dashboardOpen).toBe(false);
  });

  it("refuses a short dashboard token", () => {
    expect(() => readConfig({ WEBHOOK_SECRET: SECRET, DASHBOARD_TOKEN: "short" })).toThrow(/DASHBOARD_TOKEN/);
    expect(readConfig({ WEBHOOK_SECRET: SECRET, DASHBOARD_TOKEN: "t".repeat(16) }).dashboardToken).toBe("t".repeat(16));
  });

  it("defaults the timezone and the database path", () => {
    expect(readConfig({ WEBHOOK_SECRET: SECRET })).toMatchObject({ timeZone: "America/New_York", databasePath: "./data/calls.db", demo: false });
  });

  it("takes the timezone and database path from the environment", () => {
    const config = readConfig({ WEBHOOK_SECRET: SECRET, DASHBOARD_TZ: "Europe/Berlin", DATABASE_PATH: "/tmp/x.db" });
    expect(config).toMatchObject({ timeZone: "Europe/Berlin", databasePath: "/tmp/x.db" });
  });

  it("rejects an unknown timezone at startup", () => {
    expect(() => readConfig({ WEBHOOK_SECRET: SECRET, DASHBOARD_TZ: "Mars/Olympus" })).toThrow(/unknown time zone/);
  });

  describe("demo mode", () => {
    it("fills in a secret and a separate database, and leaves the dashboard open", () => {
      expect(readConfig({ DEMO_MODE: "1" })).toMatchObject({
        demo: true,
        secret: DEMO_SECRET,
        dashboardToken: undefined,
        dashboardOpen: true,
        databasePath: "./data/demo.db",
      });
    });

    it("asks for the token again if one is set", () => {
      const config = readConfig({ DEMO_MODE: "1", DASHBOARD_TOKEN: "t".repeat(20) });
      expect(config).toMatchObject({ dashboardToken: "t".repeat(20), dashboardOpen: false });
    });

    it("lets the environment override the demo defaults", () => {
      const config = readConfig({ DEMO_MODE: "1", WEBHOOK_SECRET: SECRET, DASHBOARD_TOKEN: "t".repeat(20), DATABASE_PATH: "/tmp/demo.db" });
      expect(config).toMatchObject({ secret: SECRET, dashboardToken: "t".repeat(20), dashboardOpen: false, databasePath: "/tmp/demo.db" });
    });

    it("is only switched on by DEMO_MODE=1", () => {
      for (const value of ["0", "true", "", undefined]) {
        expect(() => readConfig({ DEMO_MODE: value })).toThrow(/WEBHOOK_SECRET/);
      }
    });
  });
});
