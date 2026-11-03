import { deliverOverHttp, Simulator } from "./simulator.ts";

/**
 * `npm run simulate`: plays the AI receptionist against a running server, sending fictional signed
 * call summaries (with the odd retry, mistake and forgery thrown in) so you can watch them land.
 *
 *   npm run simulate -- --url http://localhost:3000 --interval 3000 --count 20
 */

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const secret = process.env.WEBHOOK_SECRET ?? "";
if (!secret) {
  console.error("Set WEBHOOK_SECRET to the same secret the server uses.");
  process.exit(1);
}

const url = flag("url", "http://localhost:3000");
const interval = Number(flag("interval", "3000"));
const count = Number(flag("count", "Infinity"));

const receptionist = new Simulator({ secret, deliver: deliverOverHttp(url) });

for (let i = 0; i < count; i++) {
  const { kind, status, json } = await receptionist.send(receptionist.nextKind());
  console.log(`${String(i + 1).padStart(3)}  ${kind.padEnd(9)} -> ${status} ${String(json.status)}`);
  if (i < count - 1) await new Promise((resolve) => setTimeout(resolve, interval));
}
