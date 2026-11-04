import { buildDashboard, isRange, RANGE_DAYS } from "../dashboard";
import { dashboardAccessDenied, json } from "../http";
import type { CallStore } from "../store";

export interface DashboardDeps {
  store: CallStore;
  token: string | undefined;
  open?: boolean;
  timeZone: string;
  demo: boolean;
  now?: Date;
}

export function handleDashboard(request: Request, deps: DashboardDeps): Response {
  const { store, token, open = false, timeZone, demo, now } = deps;
  const noStore = { "Cache-Control": "no-store" };

  const denied = dashboardAccessDenied(request, { token, open });
  if (denied) return denied;

  const days = Number(new URL(request.url).searchParams.get("days") ?? 14);
  if (!isRange(days)) {
    return json(
      { status: "invalid", errors: [{ field: "days", message: `must be one of ${RANGE_DAYS.join(", ")}` }] },
      422,
      noStore,
    );
  }
  return json({ ...buildDashboard(store, { days, timeZone, now }), demo }, 200, noStore);
}
