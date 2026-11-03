import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { seedHistory } from "./seed.ts";
import { deliverTo, Simulator } from "./simulator.ts";
import { CallStore } from "./store.ts";

/**
 * `npm run demo`: a self-contained showcase. Starts the real server on a throwaway demo database, fills it
 * with 30 days of made-up history, then plays the AI receptionist so calls keep arriving while you watch.
 * Every name and number is fictional. Nothing here talks to any outside service.
 */

const SECRET = "demo-webhook-secret-0123456789";
const DASHBOARD_TOKEN = "demo-dashboard-key-2026";

function main() {
  const store = new CallStore(process.env.DATABASE_PATH ?? "./data/demo.db");
  if (store.count() === 0) seedHistory(store, { days: 30, now: new Date(), seed: 2026 });

  const app = createApp({
    store,
    secret: SECRET,
    dashboardToken: DASHBOARD_TOKEN,
    demo: true,
    log: (entry) => process.env.DEMO_VERBOSE && console.log(JSON.stringify(entry)),
  });

  const port = Number(process.env.PORT ?? 3000);
  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`\n  Call Desk demo is running (all data is fictional)\n`);
    console.log(`  Dashboard:  http://localhost:${info.port}/#key=${DASHBOARD_TOKEN}`);
    console.log(`  Webhook:    POST http://localhost:${info.port}/webhooks/call-summary\n`);
    console.log(`  A simulated receptionist sends a call every few seconds. Ctrl+C to stop.\n`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(
      err.code === "EADDRINUSE"
        ? `\n  Port ${port} is already in use (another copy of the demo, or another app?).\n  Stop it, or use a different port:   PORT=${port + 1} npm run demo\n`
        : err.message,
    );
    process.exit(1);
  });

  let timer: NodeJS.Timeout | undefined;
  if (process.env.DEMO_LIVE !== "0") {
    const receptionist = new Simulator({ secret: SECRET, deliver: deliverTo(app) });
    const tick = () => {
      receptionist.send(receptionist.nextKind()).catch(() => {}).finally(() => {
        timer = setTimeout(tick, 2500 + Math.random() * 3500);
      });
    };
    timer = setTimeout(tick, 2000);
  }

  const shutdown = () => {
    clearTimeout(timer);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
