# PayTaxi Ethiopia

PayTaxi is a mobile-first taxi payment experience for Ethiopia. Passengers scan a taxi QR code, verify the driver, choose a fare in ETB, and pay through AddisPay. Drivers get a lightweight earnings dashboard with transaction history and QR management.

## Preview routes

- `/` — passenger landing page, payment flow, and driver dashboard demo
- `POST /api/payments/initiate` — starts a simulated AddisPay checkout
- `POST /api/webhooks/addispay` — verifies a sandbox webhook signature

The preview intentionally uses a simulated AddisPay provider so the UX can be exercised without real credentials. The production boundary is `lib/payments/provider.ts`; replace `AddisPaySandboxProvider` with the live implementation while keeping the `PaymentProvider` interface.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS v4 with semantic design tokens
- Neon Postgres with Drizzle ORM
- AddisPay provider abstraction with a safe sandbox implementation
- Generated driver profile assets in `public/drivers`

## Database

`lib/db/schema.ts` contains the core Postgres tables: app users, driver profiles, taxi QR codes, transactions, and webhook events. The shared client in `lib/db/index.ts` uses `DATABASE_URL` and a single `pg` pool.

Before production, apply the schema through the connected Neon migration workflow and add authentication, server-side session scoping, webhook idempotency, and payout reconciliation.

## Payment safety

Never trust a fare, currency, driver, or transaction status from the browser in production. Re-load the driver and fare policy server-side, create an idempotent transaction, validate the AddisPay webhook signature, and persist the raw provider event before marking a transaction successful.
