import type { DeliveryKind } from "@/lib/demo/simulator";
import type { FlowResult } from "@/lib/flow";
import type { DemoCall } from "@/lib/handlers/demo";
import type { Exchange } from "./exchange";

export interface Stored {
  total: number;
  calls: DemoCall[];
}

// "off" means the server has demo mode switched off. "error" covers everything else that can go wrong.
export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: "off" | "error" };

const failure = (status: number): Outcome<never> => ({ ok: false, reason: status === 404 ? "off" : "error" });

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isStored(value: unknown): value is Stored {
  const body = value as Partial<Stored> | null;
  return typeof body?.total === "number" && Array.isArray(body.calls);
}

function isSent(value: unknown): value is { request: { signature: string; body: string }; response: { status: number; body: FlowResult["body"] } } {
  const body = value as { request?: { signature?: unknown; body?: unknown }; response?: { status?: unknown } } | null;
  return typeof body?.request?.signature === "string" && typeof body.request.body === "string" && typeof body.response?.status === "number";
}

export async function loadStored(): Promise<Outcome<Stored>> {
  try {
    const response = await fetch("/api/demo/calls", { cache: "no-store" });
    if (!response.ok) return failure(response.status);
    const body = await readJson(response);
    return isStored(body) ? { ok: true, value: body } : { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function sendCall(kind: DeliveryKind): Promise<Outcome<Exchange>> {
  try {
    const response = await fetch(`/api/demo/send?kind=${kind}`, { method: "POST" });
    if (!response.ok) return failure(response.status);
    const body = await readJson(response);
    if (!isSent(body)) return { ok: false, reason: "error" };
    return { ok: true, value: { ...body.request, status: body.response.status, answer: body.response.body } };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function clearStored(): Promise<Outcome<null>> {
  try {
    const response = await fetch("/api/demo/calls", { method: "DELETE" });
    return response.ok ? { ok: true, value: null } : failure(response.status);
  } catch {
    return { ok: false, reason: "error" };
  }
}
