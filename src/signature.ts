import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-webhook-signature";

/** `sha256=<hex>` HMAC of the exact bytes of the request body. */
export function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifySignature(body: string, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(header);
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  return expected.length === received.length && timingSafeEqual(expected, received);
}
