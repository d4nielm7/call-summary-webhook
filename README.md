# Call Summary Webhook

A small API endpoint that receives an AI receptionist's call summary as a webhook, **validates** it, **prevents duplicates** and **stores** it.

TypeScript · [Hono](https://hono.dev) · [zod](https://zod.dev) · SQLite (Node's built-in `node:sqlite`, so no native build step) · tests with `node:test`.

> All data in this repo (tests, examples) is fictional. Nothing here uses real people or real patient information.

## Run it

Requires Node **22.18+**.

```bash
npm install
cp .env.example .env        # then set WEBHOOK_SECRET, e.g. `openssl rand -hex 32`
npm start                   # http://localhost:3000
npm run check               # typecheck + all tests
```

## The endpoint

`POST /webhooks/call-summary`

```json
{
  "call_id": "call_sample_0001",
  "caller_name": "Jane Sample",
  "phone": "(555) 010-0123",
  "reason": "Would like to book a routine check-up.",
  "requested_time": "2026-11-10T09:00:00-05:00"
}
```

| Field | Rules |
| --- | --- |
| `caller_name` | required, 1-100 chars, whitespace collapsed |
| `phone` | required, normalised to E.164. `+`-prefixed numbers must be valid E.164; a bare 10-digit number is assumed US/CA (`+1`); anything else is rejected, not guessed |
| `reason` | required, 1-1000 chars |
| `requested_time` | required, ISO 8601 **with a timezone** (`Z` or an offset), stored as UTC. A bare `3pm` or `2026-11-10T15:00` is rejected because it's ambiguous |
| `call_id` | optional, the platform's own id for the call. Strongest duplicate key when present |

Unknown fields are ignored (and not stored).

### Authentication

Every request must carry `X-Webhook-Signature: sha256=<hex>`, the HMAC-SHA256 of the **raw request body** keyed with `WEBHOOK_SECRET`. It is checked in constant time before the body is parsed. To try it by hand:

```bash
BODY='{"call_id":"call_sample_0001","caller_name":"Jane Sample","phone":"(555) 010-0123","reason":"Would like to book a routine check-up.","requested_time":"2026-11-10T09:00:00-05:00"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $NF}')"
curl -i -X POST localhost:3000/webhooks/call-summary -H "x-webhook-signature: $SIG" -d "$BODY"
```

### Responses

| Status | Body | Meaning |
| --- | --- | --- |
| `201` | `{"status":"created","id":"…"}` | Stored |
| `200` | `{"status":"duplicate","id":"…","matched_on":"call_id"\|"slot"}` | Already had it; nothing written. Returns the original id |
| `400` | `{"status":"invalid_json"}` | Signed, but not JSON |
| `401` | `{"status":"unauthorized"}` | Missing or wrong signature |
| `413` | `{"status":"too_large"}` | Body over 64 KB |
| `422` | `{"status":"invalid","errors":[{"field","message"}]}` | Failed validation; every bad field listed. Messages never echo the submitted values |
| `500` | `{"status":"error"}` | Storage failure. The sender should retry |

A duplicate is a **200, not an error**: webhook senders retry anything non-2xx, so rejecting a replay would only make them retry again. `4xx` means "retrying these bytes can't help", `5xx` means "please retry".

`GET /health` returns `{"status":"ok"}`.

## How duplicates are prevented

A call is a duplicate if **either** is true:

1. it has the same `call_id` as a stored call (the platform re-sent the webhook), or
2. it has the same **normalised phone + requested time (as a UTC instant)** (the same person asking for the same slot, whether it's a retry or a second call).

`(555) 010-0123` and `+1 555 010 0123`, or `09:00-05:00` and `14:00Z`, count as the same.

- **The check is the insert.** Both rules are `UNIQUE` constraints and the write is `INSERT … ON CONFLICT DO NOTHING`, so there is no check-then-insert race. Parallel deliveries (even from several processes) store exactly one row. There's a test firing 20 at once.
- **Name and reason are deliberately not in the key.** Speech-to-text spells the same person differently ("Jon"/"John") and an LLM never words a summary the same way twice, so including them would let real duplicates through.
- **Trade-off:** two different people phoning from one number for the same slot collapse into one record. For an appointment-request inbox I judged a duplicate slot request worse than that edge case; the response says `duplicate` + the original id, so nothing fails silently. If the platform always sends a reliable `call_id`, drop rule 2 in `src/store.ts`.
- Replays of a captured, validly-signed request are harmless for the same reason, so there is no timestamp/nonce scheme.

## Layout

```
src/schema.ts     validation + normalisation (zod)
src/signature.ts  HMAC sign/verify
src/store.ts      SQLite storage + duplicate rule
src/app.ts        the HTTP endpoint (status-code policy lives here)
src/server.ts     entry point (env, startup, graceful shutdown)
test/             48 tests: unit (schema) and request-level (signing, dedupe, errors, restart persistence)
```

## Notes and next steps

- **Privacy:** caller name, phone and reason are personal data. Logs record only outcome, id and field *names*, never values (there's a test for it). In production I'd also encrypt the database at rest and add a retention policy.
- **Storage:** a SQLite file needs a persistent disk (a VM, Fly volume, etc.). On serverless platforms with ephemeral disks, swap `CallStore` for Postgres, keeping the same two `UNIQUE` constraints; the rest of the app is unchanged.
- **Not built (out of scope for a few hours):** a read/list endpoint, secret rotation (accept two secrets), rate limiting, per-tenant secrets.
