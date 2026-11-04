import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-webhook-signature";

export function sign(body: string | Uint8Array, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifySignature(body: string | Uint8Array, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
