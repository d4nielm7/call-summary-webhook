import { getConfig } from "@/lib/config";
import { getStore } from "@/lib/db";
import { getSimulator } from "@/lib/demo/runtime";
import { handleDemoCalls, handleDemoClear } from "@/lib/handlers/demo";
import { guarded } from "@/lib/http";

const deps = () => ({ demo: getConfig().demo, store: getStore, simulator: getSimulator });

export const GET = guarded(() => handleDemoCalls(deps()));
export const DELETE = guarded(() => handleDemoClear(deps()));
