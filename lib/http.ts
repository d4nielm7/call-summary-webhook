import { createHash, timingSafeEqual } from "node:crypto";

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

// Anything that throws (a bad config, a closed database) becomes a plain 500 so the sender retries.
export function guarded(handler: (request: Request) => Response | Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request);
    } catch (error) {
      console.error(JSON.stringify({ event: "request_failed", error: String(error) }));
      return json({ status: "error" }, 500);
    }
  };
}

// Returns null when the body is larger than maxBytes. Reads the stream, so a sender
// that lies about (or omits) content-length can't make us buffer more than the limit.
export async function readBody(request: Request, maxBytes: number): Promise<Buffer | null> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) return null;
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// null means the request may go ahead. Demo mode with no token set is open, since its data is made up.
export function dashboardAccessDenied(request: Request, access: { token: string | undefined; open: boolean }): Response | null {
  if (access.open) return null;
  if (!access.token) return json({ status: "not_found" }, 404);
  if (!hasBearerToken(request, access.token)) return json({ status: "unauthorized" }, 401);
  return null;
}

// Both sides are hashed first so the comparison is constant-length.
export function hasBearerToken(request: Request, expected: string): boolean {
  const given = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!given) return false;
  return timingSafeEqual(sha256(given), sha256(expected));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
