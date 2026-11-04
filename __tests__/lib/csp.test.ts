import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `));

describe("buildCsp", () => {
  const csp = buildCsp("abc123");

  it("allows scripts only from this origin and the nonce", () => {
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
  });

  it("uses the nonce for styles in production, with inline style attributes allowed separately", () => {
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'nonce-abc123'");
    expect(directive(csp, "style-src-attr")).toBe("style-src-attr 'unsafe-inline'");
  });

  it("puts a different nonce in each policy", () => {
    expect(buildCsp("one")).not.toBe(buildCsp("two"));
  });

  it("blocks framing, plugins and base tag changes", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
  });

  it("keeps everything else on this origin", () => {
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp, "font-src")).toBe("font-src 'self'");
  });

  it("only allows eval and inline styles in development", () => {
    const dev = buildCsp("abc123", true);
    expect(dev).toContain("'unsafe-eval'");
    expect(directive(dev, "style-src")).toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(directive(csp, "style-src")).not.toContain("'unsafe-inline'");
  });
});
