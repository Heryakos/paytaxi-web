# PayTaxi architecture

## Product surfaces

The web app has three surfaces behind one preview entry point:

1. **Passenger** — driver verification, fare selection, AddisPay checkout, pending/success/failure states, and a backup code affordance.
2. **Driver** — earnings summary, recent payments, payout status, and an active QR code.
3. **Operations** — represented by the schema and API boundaries; an admin console can be added without changing the payment contract.

## Payment boundary

`PaymentProvider` is the only interface the app should use to initiate payments or verify callbacks. The current `AddisPaySandboxProvider` returns a deterministic pending checkout and accepts the sandbox signature `sandbox-signature` outside production. A live provider should add request signing, timeout handling, provider reference persistence, and idempotency keys.

```text
Passenger UI
    -> POST /api/payments/initiate
        -> validate fare + taxi
        -> create PENDING transaction
        -> PaymentProvider.initiatePayment()
            -> AddisPay adapter
                -> webhook /api/webhooks/addispay
                    -> verify signature
                    -> persist webhook event
                    -> update transaction
```

## Data model

- `app_user` stores passenger, driver, and admin identities.
- `driver_profile` stores verification documents, vehicle details, rating, and payout references.
- `taxi_qr` maps a public taxi ID to one verified driver and supports disable/replacement states.
- `transaction` is the source of truth for ETB payments and provider references.
- `webhook_event` provides an audit trail and an idempotency surface for provider callbacks.

## Production hardening checklist

- Add Better Auth email/password or phone authentication and scope every Neon query to the session user.
- Apply the Drizzle schema through Neon MCP before using live database queries.
- Validate fare caps and taxi status server-side.
- Add unique provider event IDs and transaction state transition rules.
- Store secrets only in Vercel project environment variables.
- Add rate limiting, structured audit logs, refunds, and payout reconciliation.
- Add universal/app links and a React Native client in the monorepo when mobile delivery is ready.
