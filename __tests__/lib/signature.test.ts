import { describe, expect, it } from "vitest";
import { sign, verifySignature } from "@/lib/signature";

const SECRET = "a-test-secret-of-sufficient-length";
const BODY = '{"caller_name":"Jane Sample"}';

describe("sign", () => {
  it("matches a known HMAC-SHA256 test vector", () => {
    expect(sign("The quick brown fox jumps over the lazy dog", "key")).toBe(
      "sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("gives the same signature for a string and its bytes", () => {
    expect(sign(BODY, SECRET)).toBe(sign(new TextEncoder().encode(BODY), SECRET));
  });
});

describe("verifySignature", () => {
  it("accepts the signature of the exact body", () => {
    expect(verifySignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it("rejects a body that changed by a single byte", () => {
    expect(verifySignature(BODY + " ", sign(BODY, SECRET), SECRET)).toBe(false);
    expect(verifySignature(BODY.replace("Jane", "Jake"), sign(BODY, SECRET), SECRET)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifySignature(BODY, sign(BODY, "some-other-secret-value"), SECRET)).toBe(false);
  });

  it.each([null, "", "sha256=", "sha256=deadbeef", "deadbeef", "SHA256=abc", "sha1=abc"])("rejects the header %j", (header) => {
    expect(verifySignature(BODY, header, SECRET)).toBe(false);
  });

  it("rejects the hex digest without its sha256= prefix", () => {
    const bare = sign(BODY, SECRET).replace("sha256=", "");
    expect(verifySignature(BODY, bare, SECRET)).toBe(false);
  });

  it("rejects an upper-cased digest", () => {
    const upper = `sha256=${sign(BODY, SECRET).slice(7).toUpperCase()}`;
    expect(verifySignature(BODY, upper, SECRET)).toBe(false);
  });

  it("works on bytes that are not valid UTF-8", () => {
    const bytes = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
    expect(verifySignature(bytes, sign(bytes, SECRET), SECRET)).toBe(true);
  });
});
