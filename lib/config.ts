export interface Config {
  secret: string;
  databasePath: string;
  demo: boolean;
}

type Env = Record<string, string | undefined>;

export const DEMO_SECRET = "demo-webhook-secret-0123456789";

export function readConfig(env: Env = process.env): Config {
  const demo = env.DEMO_MODE === "1";

  const secret = env.WEBHOOK_SECRET || (demo ? DEMO_SECRET : "");
  if (secret.length < 16) {
    throw new Error("WEBHOOK_SECRET must be at least 16 characters (try: openssl rand -hex 32)");
  }

  return {
    secret,
    databasePath: env.DATABASE_PATH || (demo ? "./data/demo.db" : "./data/calls.db"),
    demo,
  };
}

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= readConfig();
  return cached;
}
