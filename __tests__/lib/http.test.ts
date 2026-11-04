import { describe, expect, it, vi } from "vitest";
import { guarded, json, readBody } from "@/lib/http";

const post = (body?: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers });

function chunked(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readBody", () => {
  it("returns the bytes of a small body", async () => {
    const body = await readBody(post("hello"), 100);
    expect(body?.toString()).toBe("hello");
  });

  it("returns an empty buffer when there is no body", async () => {
    const body = await readBody(new Request("http://localhost/x", { method: "POST" }), 100);
    expect(body?.length).toBe(0);
  });

  it("accepts a body exactly at the limit", async () => {
    expect(await readBody(post("x".repeat(100)), 100)).not.toBeNull();
  });

  it("refuses a body one byte over the limit", async () => {
    expect(await readBody(post("x".repeat(101)), 100)).toBeNull();
  });

  it("refuses on the declared length without reading the body", async () => {
    const request = post("tiny", { "content-length": "5000" });
    expect(await readBody(request, 100)).toBeNull();
  });

  it("stops reading a stream that exceeds the limit even with no content-length", async () => {
    const request = new Request("http://localhost/x", { method: "POST", body: chunked(["x".repeat(60), "x".repeat(60)]), duplex: "half" } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();
    expect(await readBody(request, 100)).toBeNull();
  });

  it("joins a body that arrives in several chunks", async () => {
    const request = new Request("http://localhost/x", { method: "POST", body: chunked(["ab", "cd", "ef"]), duplex: "half" } as RequestInit);
    expect((await readBody(request, 100))?.toString()).toBe("abcdef");
  });

  it("counts bytes, not characters", async () => {
    expect(await readBody(post("é".repeat(60)), 100)).toBeNull();
  });
});

describe("json", () => {
  it("sets the status and a JSON content type", async () => {
    const response = json({ a: 1 }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("passes extra headers through", () => {
    expect(json({}, 200, { "Cache-Control": "no-store" }).headers.get("cache-control")).toBe("no-store");
  });
});

describe("guarded", () => {
  it("passes a normal response through", async () => {
    const handler = guarded(() => json({ ok: true }));
    expect((await handler(post())).status).toBe(200);
  });

  it("turns a throw into a plain 500 without leaking the message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = guarded(() => {
      throw new Error("secret internal detail");
    });
    const response = await handler(post());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ status: "error" });
    error.mockRestore();
  });

  it("also catches an async rejection", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = guarded(async () => {
      throw new Error("later");
    });
    expect((await handler(post())).status).toBe(500);
    error.mockRestore();
  });
});
