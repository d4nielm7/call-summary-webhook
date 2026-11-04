import { dashboardAccessDenied, json } from "../http";
import { DELIVERY_KINDS, type DeliveryKind, type Simulator } from "../demo/simulator";

export interface SimulateDeps {
  demo: boolean;
  token: string | undefined;
  open?: boolean;
  simulator: () => Simulator;
}

export async function handleSimulate(request: Request, deps: SimulateDeps): Promise<Response> {
  if (!deps.demo) return json({ status: "not_found" }, 404);
  const denied = dashboardAccessDenied(request, { token: deps.token, open: deps.open ?? false });
  if (denied) return denied;

  const kind = new URL(request.url).searchParams.get("kind") ?? "call";
  if (!DELIVERY_KINDS.includes(kind as DeliveryKind)) {
    return json(
      { status: "invalid", errors: [{ field: "kind", message: `must be one of ${DELIVERY_KINDS.join(", ")}` }] },
      422,
    );
  }

  const result = await deps.simulator().send(kind as DeliveryKind);
  return json({ kind: result.kind, status: result.status, result: result.json });
}
