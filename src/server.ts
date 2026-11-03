import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { CallStore } from "./store.ts";

const secret = process.env.WEBHOOK_SECRET ?? "";
if (secret.length < 16) {
  console.error("WEBHOOK_SECRET must be set to at least 16 characters (try: openssl rand -hex 32)");
  process.exit(1);
}

const dashboardToken = process.env.DASHBOARD_TOKEN || undefined;
if (dashboardToken && dashboardToken.length < 16) {
  console.error("DASHBOARD_TOKEN must be at least 16 characters (try: openssl rand -hex 24)");
  process.exit(1);
}

const store = new CallStore(process.env.DATABASE_PATH ?? "./data/calls.db");
const app = createApp({ store, secret, dashboardToken, timeZone: process.env.DASHBOARD_TZ || undefined, log: (entry) => console.log(JSON.stringify(entry)) });

const port = Number(process.env.PORT ?? 3000);
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ event: "listening", port: info.port, dashboard: Boolean(dashboardToken) }));
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
