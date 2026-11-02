import { z } from "zod";

/**
 * Phone numbers are normalised to E.164 so "(555) 010-0123" and "+1 555 010 0123"
 * are the same number when we compare them for duplicates.
 *
 * - With a leading "+": must be a plausible E.164 number (8-15 digits, no leading 0).
 * - Without one: a 10-digit (or 11-digit starting with 1) number is assumed to be US/Canada.
 *   Anything else is rejected rather than guessed at.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;

  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && /^1[2-9]/.test(digits)) return `+${digits}`;
  return null;
}

const MIN_TIME = Date.parse("2000-01-01T00:00:00Z");
const MAX_TIME = Date.parse("2100-01-01T00:00:00Z");

const callSummarySchema = z.object({
  // Optional id from the receptionist platform. When present it is the strongest duplicate key.
  call_id: z.string().trim().min(1, "must not be empty").max(128, "must be at most 128 characters").optional(),

  caller_name: z
    .string({ error: "is required and must be a string" })
    .trim()
    .min(1, "must not be empty")
    .max(100, "must be at most 100 characters")
    .transform((v) => v.replace(/\s+/g, " ")),

  phone: z
    .string({ error: "is required and must be a string" })
    .transform((v, ctx) => {
      const phone = normalizePhone(v);
      if (phone === null) {
        ctx.addIssue({ code: "custom", message: "must be a valid phone number (E.164, or a 10-digit US/CA number)" });
        return z.NEVER;
      }
      return phone;
    }),

  reason: z
    .string({ error: "is required and must be a string" })
    .trim()
    .min(1, "must not be empty")
    .max(1000, "must be at most 1000 characters"),

  // ISO 8601 *with* an offset or "Z". "3pm" or "2026-11-10T15:00" is ambiguous about the
  // timezone, so it is rejected instead of silently interpreted in the server's timezone.
  requested_time: z
    .iso.datetime({ offset: true, error: "must be an ISO 8601 date-time with a timezone, e.g. 2026-11-10T15:00:00-05:00" })
    // A transform (unlike a refine) is skipped when the format check above already failed,
    // so a malformed value yields exactly one error.
    .transform((v, ctx) => {
      const t = Date.parse(v);
      if (!(t >= MIN_TIME && t < MAX_TIME)) {
        ctx.addIssue({ code: "custom", message: "must be a realistic date (2000-2099)" });
        return z.NEVER;
      }
      return new Date(t).toISOString();
    }),
});

export interface CallSummary {
  callId: string | null;
  callerName: string;
  phone: string;
  reason: string;
  requestedTime: string; // UTC ISO 8601
}

export interface FieldError {
  field: string;
  message: string;
}

export type ParseResult = { ok: true; value: CallSummary } | { ok: false; errors: FieldError[] };

/** Validates and normalises a webhook body. Error messages never echo the submitted values. */
export function parseCallSummary(body: unknown): ParseResult {
  const result = callSummarySchema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(body)",
        message: issue.message,
      })),
    };
  }
  const d = result.data;
  return {
    ok: true,
    value: {
      callId: d.call_id ?? null,
      callerName: d.caller_name,
      phone: d.phone,
      reason: d.reason,
      requestedTime: d.requested_time,
    },
  };
}
