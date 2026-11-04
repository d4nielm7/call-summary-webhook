import { describe, expect, it } from "vitest";
import { createRng, deliverToWebhook, duplicateOf, invalidCall, randomCall, Simulator } from "@/lib/demo/simulator";
import { parseCallSummary } from "@/lib/schema";
import { CallStore } from "@/lib/store";
import { SECRET } from "../helpers";

const now = new Date("2026-11-03T15:00:00Z");

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 10 }, a)).toEqual(Array.from({ length: 10 }, b));
  });

  it("gives a different sequence for another seed", () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it("stays in [0, 1)", () => {
    const rng = createRng(9);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("randomCall", () => {
  it("only invents valid calls from the phone range reserved for fiction", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const parsed = parseCallSummary(randomCall(rng, now));
      expect(parsed.ok, `call ${i}`).toBe(true);
      if (parsed.ok) expect(parsed.value.phone).toMatch(/^\+1\d{3}55501\d{2}$/);
    }
  });

  it("asks for a time in the future", () => {
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) {
      const parsed = parseCallSummary(randomCall(rng, now));
      expect(parsed.ok && Date.parse(parsed.value.requestedTime)).toBeGreaterThan(now.getTime());
    }
  });

  it("asks for a time within business hours at the clinic", () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const hour = Number(randomCall(rng, now).requested_time.slice(11, 13));
      expect(hour).toBeGreaterThanOrEqual(8);
      expect(hour).toBeLessThanOrEqual(17);
    }
  });

  it("is repeatable for a seed", () => {
    expect(randomCall(createRng(11), now)).toEqual(randomCall(createRng(11), now));
  });
});

describe("duplicateOf", () => {
  it("makes duplicates that the store really recognises", () => {
    const rng = createRng(11);
    for (let i = 0; i < 100; i++) {
      const store = new CallStore(":memory:");
      const original = randomCall(rng, now);
      const first = parseCallSummary(original);
      const again = parseCallSummary(duplicateOf(rng, original));
      expect(first.ok && again.ok).toBe(true);
      if (first.ok && again.ok) {
        expect(store.save(first.value).created).toBe(true);
        expect(store.save(again.value).created, `duplicate ${i}`).toBe(false);
      }
    }
  });

  it("sometimes resends the exact payload and sometimes rewrites it", () => {
    const rng = createRng(21);
    const original = randomCall(rng, now);
    const kinds = new Set(Array.from({ length: 60 }, () => (duplicateOf(rng, original).call_id === original.call_id ? "same" : "rewritten")));
    expect(kinds).toEqual(new Set(["same", "rewritten"]));
  });
});

describe("invalidCall", () => {
  it("makes calls that the validator really rejects", () => {
    const rng = createRng(13);
    for (let i = 0; i < 200; i++) expect(parseCallSummary(invalidCall(rng, now)).ok, `invalid ${i}`).toBe(false);
  });

  it("breaks one thing at a time", () => {
    const rng = createRng(17);
    const broken = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = parseCallSummary(invalidCall(rng, now));
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        broken.add(result.errors[0]!.field);
      }
    }
    expect([...broken].sort()).toEqual(["caller_name", "phone", "reason", "requested_time"]);
  });
});

describe("Simulator", () => {
  const make = (seed = 1) => {
    const store = new CallStore(":memory:");
    return { store, simulator: new Simulator({ secret: SECRET, seed, deliver: deliverToWebhook({ store, secret: SECRET }) }) };
  };

  it("delivers each kind through the real webhook", async () => {
    const { simulator, store } = make();
    expect(await simulator.send("call", now)).toMatchObject({ kind: "call", status: 201 });
    expect(await simulator.send("duplicate", now)).toMatchObject({ kind: "duplicate", status: 200 });
    expect(await simulator.send("invalid", now)).toMatchObject({ kind: "invalid", status: 422 });
    expect(await simulator.send("unsigned", now)).toMatchObject({ kind: "unsigned", status: 401 });
    expect(store.count()).toBe(1);
  });

  it("sends a new call when there is nothing to duplicate yet", async () => {
    expect(await make().simulator.send("duplicate", now)).toMatchObject({ kind: "call", status: 201 });
  });

  it("only repeats calls it really sent", async () => {
    const { simulator, store } = make();
    for (let i = 0; i < 5; i++) await simulator.send("call", now);
    for (let i = 0; i < 20; i++) expect((await simulator.send("duplicate", now)).status).toBe(200);
    expect(store.count()).toBe(5);
  });

  it("mixes outcomes the way a busy day does", () => {
    const { simulator } = make(99);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const kind = simulator.nextKind();
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    expect(counts.call).toBeGreaterThan(counts.duplicate!);
    expect(counts.duplicate).toBeGreaterThan(counts.invalid!);
    expect(counts.invalid).toBeGreaterThan(counts.unsigned!);
    expect(counts.unsigned).toBeGreaterThan(0);
  });
});
