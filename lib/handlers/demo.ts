import { json } from "../http";
import { DELIVERY_KINDS, type DeliveryKind, type Simulator } from "../demo/simulator";
import type { CallStore } from "../store";

export interface DemoDeps {
  demo: boolean;
  store: () => CallStore;
  simulator: () => Simulator;
}

export const LIST_LIMIT = 20;

export interface DemoCall {
  id: string;
  caller_name: string;
  phone: string;
  reason: string;
  requested_time: string;
  received_at: string;
}

export async function handleDemoSend(request: Request, deps: DemoDeps): Promise<Response> {
  if (!deps.demo) return json({ status: "not_found" }, 404);

  const kind = new URL(request.url).searchParams.get("kind") ?? "call";
  if (!DELIVERY_KINDS.includes(kind as DeliveryKind)) {
    return json({ status: "invalid", errors: [{ field: "kind", message: `must be one of ${DELIVERY_KINDS.join(", ")}` }] }, 422);
  }

  const sent = await deps.simulator().send(kind as DeliveryKind);
  return json({
    kind: sent.kind,
    request: { signature: sent.signature, body: sent.body },
    response: { status: sent.status, body: sent.json },
  });
}

export function handleDemoCalls(deps: DemoDeps): Response {
  if (!deps.demo) return json({ status: "not_found" }, 404);

  const store = deps.store();
  const calls: DemoCall[] = store.latest(LIST_LIMIT).map((call) => ({
    id: call.id,
    caller_name: call.callerName,
    phone: call.phone,
    reason: call.reason,
    requested_time: call.requestedTime,
    received_at: call.receivedAt,
  }));
  return json({ total: store.count(), calls }, 200, { "Cache-Control": "no-store" });
}

export function handleDemoClear(deps: DemoDeps): Response {
  if (!deps.demo) return json({ status: "not_found" }, 404);

  deps.store().clear();
  return json({ status: "cleared" });
}
