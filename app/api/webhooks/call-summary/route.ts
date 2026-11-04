import { getConfig } from "@/lib/config";
import { getStore } from "@/lib/db";
import { handleCallSummary } from "@/lib/handlers/call-summary";
import { guarded } from "@/lib/http";

export const POST = guarded((request) =>
  handleCallSummary(request, {
    store: getStore(),
    secret: getConfig().secret,
    log: (entry) => console.log(JSON.stringify(entry)),
  }),
);
