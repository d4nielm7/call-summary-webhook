# Call summary webhook

An endpoint that receives the summary an AI receptionist sends after a call (caller name, phone, reason for calling, requested time), checks it, drops duplicates and stores it in SQLite. Next.js (App Router) and TypeScript.

![The demo page](docs/flow.png)

## Run it

Needs Node 22.13 or newer.

```sh
npm install
npm run demo
```

Open the Local URL it prints. The page plays the receptionist: each button sends a signed request to the real endpoint and shows the request, the answer and which check stopped it. The list at the bottom is what is actually in the database, and it starts empty. A request sent from a terminal shows up there too. All names and numbers are made up.

To run only the endpoint:

```sh
cp .env.example .env.local   # set WEBHOOK_SECRET
npm run dev
```

The demo page and its `/api/demo/*` routes exist only when `DEMO_MODE=1` (that is what `npm run demo` sets). Without it, the server has the webhook and nothing that reads stored calls back.

| Variable | |
| --- | --- |
| `WEBHOOK_SECRET` | Required, 16+ characters. Used to sign request bodies. Demo mode has its own. |
| `DATABASE_PATH` | SQLite file. Default `./data/calls.db`, or `./data/demo.db` in demo mode. |

## The endpoint

`POST /api/webhooks/call-summary`

The sender signs the raw body with the shared secret and sends the result in `X-Webhook-Signature: sha256=<hex>` (HMAC-SHA256).

```sh
BODY='{"call_id":"call_001","caller_name":"Jane Sample","phone":"(555) 010-0123","reason":"Routine check-up","requested_time":"2026-12-01T09:00:00-05:00"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $NF}')"

curl -i -X POST http://localhost:3000/api/webhooks/call-summary \
  -H "content-type: application/json" -H "x-webhook-signature: $SIG" -d "$BODY"
```

In demo mode the secret is `demo-webhook-secret-0123456789`.

| Field | Rules |
| --- | --- |
| `caller_name` | Required, up to 100 characters. Whitespace is collapsed. |
| `phone` | Required. Stored as E.164. A number without `+` must be a 10-digit US/CA number. |
| `reason` | Required, up to 1000 characters. |
| `requested_time` | Required. ISO 8601 with a timezone or offset. Stored in UTC. |
| `call_id` | Optional, up to 128 characters. The sender's own id for the call. |

Other fields are ignored.

| Status | Body | Meaning |
| --- | --- | --- |
| 201 | `{"status":"created","id":"..."}` | Stored. |
| 200 | `{"status":"duplicate","id":"...","matched_on":"call_id"}` | Already had it. `matched_on` is `call_id` or `slot`. |
| 400 | `{"status":"invalid_json"}` | Signed, but not JSON. |
| 401 | `{"status":"unauthorized"}` | Missing or wrong signature. |
| 413 | `{"status":"too_large"}` | Body over 64 KB. |
| 422 | `{"status":"invalid","errors":[{"field","message"}]}` | Failed validation. Errors never repeat the submitted value. |
| 500 | `{"status":"error"}` | Storage failed. The sender should retry. |

A duplicate is a 200 on purpose. Webhook senders retry anything that isn't a success, so an error would only make them send it again.

## Duplicates

A call is a duplicate if it has the same `call_id`, or the same phone number asking for the same time slot. Name and reason are left out of the second rule because speech-to-text spells names differently from call to call and a summary is never worded the same way twice.

The check and the insert are one statement (`INSERT ... ON CONFLICT DO NOTHING` against two `UNIQUE` columns), so two identical requests arriving together can't both be stored. There is a test that fires 20 at once.

## Tests

```sh
npm test         # vitest
npm run check    # lint, typecheck and tests
```

About 230 tests: validation edge cases, the handler with every status code, concurrent duplicates, restart persistence, request size limits, config, the simulator, the route wiring and the demo page.

## Layout

```
app/
  api/webhooks/call-summary/   the endpoint
  api/demo/                    demo only: send a made-up call, list and clear what is stored
  page.tsx                     the demo page
lib/
  handlers/                    request logic, plain Request in and Response out
  schema.ts  signature.ts  store.ts  config.ts  flow.ts
  demo/                        the simulated receptionist
components/                    the demo page
__tests__/
```

The handlers in `lib/handlers` don't import anything from Next, which is why they can be tested directly and moved to another server if needed.

## Notes

- The brief doesn't say how the platform authenticates, so signing the body with a shared secret is my assumption. It lives in `lib/signature.ts`.
- SQLite needs a disk that persists. On a serverless host, swap `CallStore` for Postgres and keep the same two unique keys.
- `node:sqlite` is still marked experimental in Node 22, so the npm scripts silence that warning.
