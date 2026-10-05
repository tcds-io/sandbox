# sandbox

A self-hostable stand-in for payment providers, for end-to-end testing.

Your app points its **real** provider adapter at the sandbox instead of the provider. The sandbox answers with the provider's real request and response shapes, and sends the provider's real webhooks when a person (in the web UI) or a test (through the control API) decides what happens to a payment.

**What it is:** a test double for the parts of a provider's API a payment flow uses, faithful to the documented shapes.

**What it isn't:**

- Not a mock of every provider feature. Only the endpoints listed below exist.
- Not for production. It never moves money, has no real security, and keeps all state in memory: a restart wipes everything.

Simulated today: **Asaas** (API v3), **payments** domain.

## Quick start

```bash
npm install
cp .env.example .env   # optional: set your webhook URL and token
npm run dev
```

- API: http://localhost:4000 (Asaas at `http://localhost:4000/asaas/v3`)
- UI: http://localhost:5173

With Docker, one image runs both:

```bash
docker run -p 15080:15080 -p 15088:15088 \
  -e ASAAS_WEBHOOK_URL=http://host.docker.internal:3000/webhooks/asaas \
  ghcr.io/tcds-io/sandbox:latest
```

or `docker compose up --build` from this repo.

- API: http://localhost:15080 (Asaas at `http://localhost:15080/asaas/v3`)
- UI: http://localhost:15088

In Docker, `PORT` defaults to `15080`, `APP_PORT` (UI) to `15088` and `PUBLIC_URL` to `http://localhost:15080`.

## Point your app at it

Change only the base URL (and key) your adapter uses:

| Provider | Real base URL | Sandbox base URL |
| --- | --- | --- |
| Asaas | `https://api-sandbox.asaas.com/v3` | `http://localhost:4000/asaas/v3` (Docker: `:15080`) |

Then set the sandbox's webhook URL to your app's webhook endpoint (`ASAAS_WEBHOOK_URL`) and the token your app checks (`ASAAS_WEBHOOK_TOKEN`).

### Asaas endpoints

All require the `access_token` header (401 `access_token_not_found` / `invalid_access_token` otherwise). Errors use Asaas's envelope: `{ "errors": [{ "code", "description" }] }`.

| Endpoint | Behaviour |
| --- | --- |
| `POST /v3/customers` | Creates a customer. Validates CPF/CNPJ check digits. |
| `GET /v3/customers?cpfCnpj=…` | Lists customers (filters: `cpfCnpj`, `email`, `name`, `externalReference`, `offset`, `limit`). |
| `GET /v3/customers/{id}` | Reads a customer. |
| `POST /v3/payments` | `billingType: "PIX"` (or `BOLETO`/`UNDEFINED`): created `PENDING`. `billingType: "CREDIT_CARD"` with `creditCardToken` and `remoteIp`: answered `CONFIRMED` in the same call. Without a token: `PENDING`. |
| `GET /v3/payments/{id}` | Current state of the payment. |
| `GET /v3/payments/{id}/pixQrCode` | `payload` (a structurally valid, unpayable BR Code), `encodedImage` (base64 PNG), `expirationDate`, `description`. |

**Card declines:** a `creditCardToken` containing `decline` (e.g. `tok_decline`) is refused with HTTP 400 `invalid_creditCard`, as Asaas does, and no payment is stored.

### Webhooks sent

POSTed to `ASAAS_WEBHOOK_URL` with the `asaas-access-token` header (when `ASAAS_WEBHOOK_TOKEN` is set). The body is Asaas's envelope `{ id, event, dateCreated, account, payment }` with the full payment object.

| When | Event | Payment status |
| --- | --- | --- |
| Any payment created | `PAYMENT_CREATED` | `PENDING` (or `CONFIRMED` for a tokenized card) |
| Card charged with a token | `PAYMENT_CONFIRMED` | `CONFIRMED` |
| **Confirm** on a Pix / boleto payment | `PAYMENT_RECEIVED` | `RECEIVED` |
| **Confirm** on a pending card payment | `PAYMENT_CONFIRMED` | `CONFIRMED` |
| **Mark overdue** on a pending payment | `PAYMENT_OVERDUE` | `OVERDUE` |

Every delivery is logged (request, response status and body, time). A non-2xx or network error is retried with exponential backoff (`WEBHOOK_RETRY_BASE_MS`, ×2 each time) up to `WEBHOOK_MAX_ATTEMPTS` attempts. A resend repeats the same request, same event `id` included, as Asaas does (at-least-once delivery).

## Control API

Provider-neutral routes under `/_sandbox`, used by the UI and by automated tests. Responses are JSON; errors are `{ "error": { "code", "message" } }`.

| Route | Purpose |
| --- | --- |
| `GET /_sandbox/providers` | Simulated providers, their sandbox base URL and webhook target. |
| `GET /_sandbox/payments?provider=&status=&outcome=` | List payments. `status` is the provider's own value (`PENDING`); `outcome` is neutral (`pending`, `paid`, `failed`, `other`). |
| `GET /_sandbox/payments/{provider}/{id}` | One payment, its provider-native payload and its webhook delivery log. |
| `POST /_sandbox/payments/{provider}/{id}/confirm` | Pay it, and send the matching webhook. |
| `POST /_sandbox/payments/{provider}/{id}/expire` | Mark it overdue/expired, and send the matching webhook. |
| `POST /_sandbox/webhooks/{deliveryId}/resend` | Send a delivery again. |
| `POST /_sandbox/reset` | Drop all state (handy between tests). |
| `GET /health` | Liveness. |

Each payment lists the actions it allows in `availableActions`. An action that does not apply to the current status answers 409.

Example, from a test:

```bash
curl -X POST http://localhost:4000/_sandbox/payments/asaas/pay_abc123/confirm
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API port. |
| `PUBLIC_URL` | `http://localhost:$PORT` | Origin used in links the sandbox returns. |
| `WEBHOOK_MAX_ATTEMPTS` | `4` | Attempts per delivery, first one included. |
| `WEBHOOK_RETRY_BASE_MS` | `1000` | Delay before the first retry; doubles each time. |
| `WEBHOOK_TIMEOUT_MS` | `5000` | Timeout per attempt. |
| `<PROVIDER>_API_KEY` | unset | Key the provider endpoints accept. Unset: any non-empty key. |
| `<PROVIDER>_WEBHOOK_URL` | unset | Where that provider's webhooks go. Unset: deliveries are logged as `skipped`. |
| `<PROVIDER>_WEBHOOK_TOKEN` | unset | Token sent in that provider's webhook auth header. |

`<PROVIDER>` is the provider id upper-cased: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_URL`, `ASAAS_WEBHOOK_TOKEN`.

## Layout

```
packages/
  sandbox-api/                 HTTP server (Hono + Zod)
    src/
      core/                    provider contract, webhook dispatcher
      domains/payments/        provider-neutral payment model, store, actions
      control/                 /_sandbox routes and their schemas
      providers/
        index.ts               the list of simulated providers
        asaas/                 everything Asaas: routes, schemas, mappers, webhooks
    test/
      fixtures/asaas/          example bodies copied from Asaas's docs
      asaas.contract.test.ts   each endpoint's shape vs. the documented shape
      e2e.test.ts              create → confirm → webhook arrives, over real HTTP
  sandbox-app/                 web UI (React + Vite), talks only to /_sandbox
```

## Add a provider

Everything provider-specific lives in one folder. To add Stripe:

1. Create `packages/sandbox-api/src/providers/stripe/` with:
   - `schemas.ts`: Zod schemas for its requests, responses and webhook body, copied from its docs.
   - `routes.ts`: a Hono app with its endpoints (auth, create, read). Persist with `ctx.payments.save(id, data, events)`; keep other resources in `ctx.collection(name)`.
   - `mappers.ts`: build its native payment object, its state transitions, and `summarize()` into the neutral fields.
   - `webhooks.ts`: `buildWebhook(event, payment, settings)` returning its real headers (signature) and body.
   - `index.ts`: `defineProvider({ id: "stripe", displayName, apiPath: "/v1", routes, payments: { summarize, buildWebhook, actions } })`. `actions.confirm` / `actions.expire` return the new state and the events to send.
2. Add it to `providers/index.ts`.
3. Add `test/fixtures/stripe/` with the documented examples and a `stripe.contract.test.ts`.

It is then mounted at `/stripe`, configured by `STRIPE_*` env vars, and shows up in the UI's provider dropdown. Nothing else changes.

To add a control action (fail, refund…), add its name to `PAYMENT_ACTIONS` in `domains/payments/model.ts` and implement it in the providers that support it; the route and UI button follow.

## Development

```bash
npm test          # contract + e2e tests
npm run typecheck
npm run build
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests and a Docker build + smoke test on every pull request.
Publishing a GitHub release tagged `vX.Y.Z` publishes the image to `ghcr.io/tcds-io/sandbox` (`X.Y.Z`, `X.Y`, and `latest` unless it is a pre-release):

```bash
gh release create v0.1.0 --generate-notes
```

## License

MIT
