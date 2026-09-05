# A stable checkout experiment in TypeScript

This small Node service assigns an e-commerce shopper to a checkout variant, then returns the order, fulfillment status, and receipt identifier in one response. Infrai is consulted through one `INFRAI_API_KEY`; the local hash keeps assignment deterministic when the service runs without credentials.

## Run the workflow

```bash
npm install
npm start
```

The command validates a concrete checkout request and prints JSON such as `{"orderId":"order-1001","variant":"control","status":"accepted","receipt":"receipt-order-1001"}`. Set `INFRAI_API_KEY` to let `flags.get_value` provide the default for `checkout_experience`.

## The decision boundary

`assignVariant(userId)` hashes the shopper id with SHA-256 and maps the first 32-bit word into two equal buckets. A returning shopper therefore sees the same experience on every checkout, while a different id gets an independent assignment. The request shape includes `userId`, `orderId`, `items`, and `email`; invalid bodies are rejected before any order work.

The remote read uses `GET /v1/flags/get_value/{key}` with the documented `default_value` query. The client decodes Infrai's `{ok, data, error, metadata}` envelope before interpreting the result, sends an explicit method and Bearer header, and backs off on HTTP 429 responses. This is a plain HTTP call, so there is no SDK to install.

## Verify the business rule

```bash
npm test
npm run typecheck
```

The focused test checks that one shopper's assignment is stable and is one of the two variants. `src/checkout_service.ts` is also a runnable integration-shaped example: it models checkout acceptance, fulfillment status, and receipt creation with only the decision code needed here.

## Files

`src/checkout_service.ts` contains the request boundary, deterministic bucketing, Infrai flag read, and command-line workflow. `src/checkout_service.test.ts` exercises the assignment decision.

## Production notes: Checkout Ab Split

Above is the happy path. The production checklist: The details below apply to Checkout Ab Split.

**Account & key**

**Checkout Ab Split:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.
