import { z } from "zod";

export interface CallSummary {
  callId: string | null;
  callerName: string;
  phone: string;
  reason: string;
  requestedTime: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export type ParseResult = { ok: true; value: CallSummary } | { ok: false; errors: FieldError[] };

const MIN_TIME = Date.parse("2000-01-01T00:00:00Z");
const MAX_TIME = Date.parse("2100-01-01T00:00:00Z");

// Without a leading + only US/CA numbers are accepted. Anything else is rejected rather than guessed.
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;

  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && /^1[2-9]/.test(digits)) return `+${digits}`;
  return null;
}

const text = (max: number) =>
  z
    .string({ error: "is required and must be a string" })
    .trim()
    .min(1, "must not be empty")
    .max(max, `must be at most ${max} characters`);

const callSummarySchema = z.object({
  call_id: z.string().trim().min(1, "must not be empty").max(128, "must be at most 128 characters").optional(),
  caller_name: text(100).transform((value) => value.replace(/\s+/g, " ")),
  phone: z.string({ error: "is required and must be a string" }).transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (phone === null) {
      ctx.addIssue({ code: "custom", message: "must be a valid phone number (E.164, or a 10-digit US/CA number)" });
      return z.NEVER;
    }
    return phone;
  }),
  reason: text(1000),
  // An offset is required: without one the server's timezone would decide what "3pm" means.
  // The range check is a transform, not a refine, so a malformed value only reports one error.
  requested_time: z.iso
    .datetime({ offset: true, error: "must be an ISO 8601 date-time with a timezone, e.g. 2026-11-10T15:00:00-05:00" })
    .transform((value, ctx) => {
      const time = Date.parse(value);
      if (!(time >= MIN_TIME && time < MAX_TIME)) {
        ctx.addIssue({ code: "custom", message: "must be a realistic date (2000-2099)" });
        return z.NEVER;
      }
      return new Date(time).toISOString();
    }),
});

export function parseCallSummary(body: unknown): ParseResult {
  const result = callSummarySchema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({ field: issue.path.join(".") || "(body)", message: issue.message })),
    };
  }
  const data = result.data;
  return {
    ok: true,
    value: {
      callId: data.call_id ?? null,
      callerName: data.caller_name,
      phone: data.phone,
      reason: data.reason,
      requestedTime: data.requested_time,
    },
  };
}
