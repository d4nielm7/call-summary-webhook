import { getConfig } from "@/lib/config";
import { getSimulator } from "@/lib/demo/runtime";
import { handleSimulate } from "@/lib/handlers/simulate";
import { guarded } from "@/lib/http";

export const POST = guarded((request) => {
  const { dashboardToken, dashboardOpen, demo } = getConfig();
  return handleSimulate(request, { demo, token: dashboardToken, open: dashboardOpen, simulator: getSimulator });
});
