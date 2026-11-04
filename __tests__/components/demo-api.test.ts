import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStored, loadStored, sendCall } from "@/components/demo-api";

const reply = (body: unknown, status = 200) => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

const sent = {
  kind: "call",
  request: { signature: "sha256=abc", body: '{"caller_name":"Jane"}' },
  response: { status: 201, body: { status: "created", id: "1" } },
};

describe("loadStored", () => {
  it("returns the stored calls", async () => {
    stubFetch(() => reply({ total: 2, calls: [{ id: "a" }, { id: "b" }] }));
    const outcome = await loadStored();
    expect(outcome).toEqual({ ok: true, value: { total: 2, calls: [{ id: "a" }, { id: "b" }] } });
  });

  it("asks for fresh data, not a cached copy", async () => {
    const fetchMock = stubFetch(() => reply({ total: 0, calls: [] }));
    await loadStored();
    expect(fetchMock).toHaveBeenCalledWith("/api/demo/calls", { cache: "no-store" });
  });

  it("says the demo is off on a 404", async () => {
    stubFetch(() => reply({ status: "not_found" }, 404));
    expect(await loadStored()).toEqual({ ok: false, reason: "off" });
  });

  it("reports an error, instead of returning the error body, on a 500", async () => {
    stubFetch(() => reply({ status: "error" }, 500));
    expect(await loadStored()).toEqual({ ok: false, reason: "error" });
  });

  it("reports an error for a 200 that has the wrong shape", async () => {
    stubFetch(() => reply({ status: "error" }));
    expect(await loadStored()).toEqual({ ok: false, reason: "error" });
    stubFetch(() => reply({ total: 1 }));
    expect(await loadStored()).toEqual({ ok: false, reason: "error" });
    stubFetch(() => reply({ total: "1", calls: [] }));
    expect(await loadStored()).toEqual({ ok: false, reason: "error" });
  });

  it("reports an error for a body that is not JSON", async () => {
    stubFetch(() => reply("<html>Bad gateway</html>", 200));
    expect(await loadStored()).toEqual({ ok: false, reason: "error" });
  });

  it("reports an error when the server cannot be reached", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(await loadStored()).toEqual({ ok: false, reason: "error" });
  });
});

describe("sendCall", () => {
  it("posts the chosen kind and returns what was sent and answered", async () => {
    const fetchMock = stubFetch(() => reply(sent));
    const outcome = await sendCall("duplicate");

    expect(fetchMock).toHaveBeenCalledWith("/api/demo/send?kind=duplicate", { method: "POST" });
    expect(outcome).toEqual({
      ok: true,
      value: { signature: "sha256=abc", body: '{"caller_name":"Jane"}', status: 201, answer: { status: "created", id: "1" } },
    });
  });

  it("keeps a refused delivery as a result, not a failure", async () => {
    stubFetch(() => reply({ ...sent, response: { status: 401, body: { status: "unauthorized" } } }));
    const outcome = await sendCall("unsigned");
    expect(outcome.ok && outcome.value.status).toBe(401);
  });

  it("says the demo is off on a 404", async () => {
    stubFetch(() => reply({ status: "not_found" }, 404));
    expect(await sendCall("call")).toEqual({ ok: false, reason: "off" });
  });

  it("reports an error on a 500", async () => {
    stubFetch(() => reply({ status: "error" }, 500));
    expect(await sendCall("call")).toEqual({ ok: false, reason: "error" });
  });

  it("reports an error for an answer with the wrong shape", async () => {
    stubFetch(() => reply({ kind: "call" }));
    expect(await sendCall("call")).toEqual({ ok: false, reason: "error" });
    stubFetch(() => reply({ ...sent, request: { signature: 1, body: "x" } }));
    expect(await sendCall("call")).toEqual({ ok: false, reason: "error" });
  });

  it("reports an error when the server cannot be reached", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(await sendCall("call")).toEqual({ ok: false, reason: "error" });
  });
});

describe("clearStored", () => {
  it("sends a DELETE", async () => {
    const fetchMock = stubFetch(() => reply({ status: "cleared" }));
    expect(await clearStored()).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/demo/calls", { method: "DELETE" });
  });

  it("tells off from error", async () => {
    stubFetch(() => reply({}, 404));
    expect(await clearStored()).toEqual({ ok: false, reason: "off" });
    stubFetch(() => reply({}, 500));
    expect(await clearStored()).toEqual({ ok: false, reason: "error" });
    stubFetch(() => Promise.reject(new Error("down")));
    expect(await clearStored()).toEqual({ ok: false, reason: "error" });
  });
});
