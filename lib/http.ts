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
