import { getConfig } from "@/lib/config";
import { getStore } from "@/lib/db";
import { handleDashboard } from "@/lib/handlers/dashboard";
import { guarded } from "@/lib/http";

export const GET = guarded((request) => {
  const { dashboardToken, dashboardOpen, timeZone, demo } = getConfig();
  return handleDashboard(request, { store: getStore(), token: dashboardToken, open: dashboardOpen, timeZone, demo });
});
