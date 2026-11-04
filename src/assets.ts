import { readFileSync } from "node:fs";

/**
 * The dashboard is a few static files. Only the paths listed here are ever served, so a request path can
 * never be turned into a file read, and nothing else in the project directory is reachable.
 */
const ROOT = new URL("../public/", import.meta.url);

const ASSETS: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/architecture": { file: "architecture.html", type: "text/html; charset=utf-8" },
  "/architecture.js": { file: "architecture.js", type: "text/javascript; charset=utf-8" },
  "/dashboard.css": { file: "dashboard.css", type: "text/css; charset=utf-8" },
  "/dashboard.js": { file: "dashboard.js", type: "text/javascript; charset=utf-8" },
  "/favicon.svg": { file: "favicon.svg", type: "image/svg+xml" },
  "/fonts/geist.woff2": { file: "fonts/geist-latin.woff2", type: "font/woff2" },
  "/fonts/geist-mono.woff2": { file: "fonts/geist-mono-latin.woff2", type: "font/woff2" },
};

export const ASSET_PATHS = Object.keys(ASSETS);

export function readAsset(path: string): { body: Buffer; type: string } | undefined {
  const asset = ASSETS[path];
  return asset && { body: readFileSync(new URL(asset.file, ROOT)), type: asset.type };
}
