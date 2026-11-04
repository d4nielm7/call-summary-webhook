import { getConfig } from "@/lib/config";
import { getStore } from "@/lib/db";
import { getSimulator } from "@/lib/demo/runtime";
import { handleDemoSend } from "@/lib/handlers/demo";
import { guarded } from "@/lib/http";

export const POST = guarded((request) =>
  handleDemoSend(request, { demo: getConfig().demo, store: getStore, simulator: getSimulator }),
);
