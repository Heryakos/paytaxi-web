# PayTaxi Project Status

## Architecture
The single Next.js app is now a 3-part monorepo:
- `/frontend` — Next.js 16 App Router UI only. No DB access. Calls `/backend` over HTTP. Uses httpOnly cookie for auth.
- `/backend` — Express + Prisma API server on port 5000.
- `/mobile` — React Native Expo app (`et.paytaxi.app`). Calls `/backend` via LAN IP. Uses expo-secure-store for JWT.
- `/packages/shared` — Shared types and browser API client (cookie-based, no localStorage).

## Now real (was static/mock before)
| Feature | Route/File |
|---|---|
| OTP challenge create & verify | `POST /auth/request-otp`, `POST /auth/verify-otp` via `backend/src/routes/auth.ts` |
| JWT access token issuance | `backend/src/services/auth.service.ts#verifyOtp` |
| **JWT as httpOnly cookie (web)** | `backend/src/routes/auth.ts` — sets `httpOnly`, `secure`, `sameSite:'strict'` cookie on login |
| **Session restore via /auth/me** | `GET /auth/me` — reads httpOnly cookie, returns current user. Frontend calls this on mount instead of localStorage |
| **POST /auth/logout** | Clears the httpOnly cookie server-side |
| Driver registration (PENDING) | `POST /drivers/register` via `backend/src/routes/drivers.ts` |
| Admin driver approval + QR issuance | `POST /drivers/:id/approve` via `backend/src/routes/drivers.ts` |
| QR replace-on-lost | `POST /qr/replace` via `backend/src/routes/qr.ts` |
| **QR PNG generation** | `GET /qr/:taxiId.png` — real scannable PNG via `qrcode` npm package. Encodes `https://paytaxi.et/t/{taxiId}` |
| **Public taxi verify (deep-link page)** | `GET /qr/:taxiId` — approved driver info, powers web `/t/{taxiId}` landing (fetch + pay) |
| Fare server validation | `backend/src/services/fares.ts` — client only sends preset ID |
| Payment initiation | `POST /payments/initiate` via `backend/src/routes/payments.ts` |
| Transaction state machine | `backend/src/services/fares.ts#canTransition` |
| **Webhook compare-and-set (fixed)** | `POST /webhooks/addispay` — zero-affected-rows re-reads status: idempotent if matches, logs warning if conflicts |
| **DB CHECK constraints** | Migration `20260808085150_add_check_constraints` — enforces valid string values for `status`, `role`, `verificationStatus` at DB level |
| Driver dashboard aggregation | `GET /dashboard` via `backend/src/routes/dashboard.ts` |
| In-memory rate limiting | OTP: 10/15min · Payments: 20/15min via `express-rate-limit` |
| Structured transaction logging | `console.log(JSON.stringify({event, timestamp, transactionId, ...}))` in payments + webhooks routes |
| **Mobile QR scanner** | `mobile/App.tsx` — expo-camera `CameraView` in a Modal; parses `https://paytaxi.et/t/{taxiId}` |
| **Mobile i18n** | `mobile/lib/i18n.ts` — react-i18next with English + Amharic for all screens |
| **Frontend i18n** | `frontend/i18n/request.ts`, `frontend/messages/{en,am}.json`, and `paytaxi-app.tsx` — uses next-intl `useTranslations()`. Features a fully working language toggle in the header that sets `NEXT_LOCALE` and reloads. |
| **Guest passenger checkout** | `POST /payments/initiate` via `optionalAuth` — unauthenticated passengers pay instantly without forced login |
| **Ethiopian minibus fare stages** | `backend/src/services/fares.ts` & `@paytaxi/shared` — 10, 15, 20, 25, 35, 50 ETB presets with seat multiplier |
| **Transaction status & receipt query** | `GET /payments/:id` via `backend/src/routes/payments.ts` — powers verified passenger & Weyala receipt |
| **Sandbox instant test simulation** | `POST /payments/:id/simulate-success` — transitions pending transaction to success for live preview testing |
| **Anti-fraud Weyala receipt** | `frontend/components/paytaxi-app.tsx` & `mobile/App.tsx` — animated green receipt with live ticking seconds, Ethiopian plate badge, and security code |
| **Driver Soundbox (Real-Time Audio)** | `frontend/components/paytaxi-app.tsx` & `backend/src/services/events.service.ts` — Web Audio API dual-tone chime (587 & 880 Hz) + Web Speech voice synthesis on `/dashboard/stream` SSE events |
| **Admin Driver Verification Portal** | `frontend/components/paytaxi-app.tsx` & `backend/src/routes/drivers.ts` — Admin portal with tab filters (All/Pending/Approved/Rejected), document modal previews, and one-click QR generation |
| **Driver Document Upload (KYC)** | `frontend/components/paytaxi-app.tsx` — Instant image upload and thumbnail preview for National ID and Driver License |
| **Supabase PostgreSQL Schema** | `backend/prisma/schema.supabase.prisma` — Turnkey PostgreSQL schema for Supabase deployment with `pnpm db:push:supabase` |
| **Android Standalone APK (EAS)** | `mobile/eas.json` & `mobile/App.tsx` — Ready for physical Android testing outside Wi-Fi via `eas build -p android --profile preview` |
| **Deployment & Operations Manual** | `docs/PAYTAXI_MANUAL.md` — Complete master guide for Supabase, Render, Vercel, and physical testing |
| **Shared package wired into frontend** | `@paytaxi/shared` consumed via `frontend/tsconfig.json` path alias `@paytaxi/shared → ../packages/shared/src` + `transpilePackages` in `frontend/next.config.mjs`. `FARE_PRESETS` imported in `paytaxi-app.tsx`. |


## canTransition() call sites (all transaction status writes)
| Write path | File | canTransition called? |
|---|---|---|
| Payment initiation | `backend/src/routes/payments.ts` | ✅ N/A — starts as `PENDING` (no prior state) |
| Webhook status update | `backend/src/routes/webhooks.ts` | ✅ Yes — called before every `updateMany` |

> **Confirmed:** Every write that changes `transaction.status` after creation goes through `canTransition()`. Initiation bypasses it correctly (PENDING is always a valid start state with no prior state to transition from).

## Still simulated
| Feature | File | What to replace |
|---|---|---|
| AddisPay checkout URL | `backend/src/services/provider.ts` → `AddisPaySandboxProvider.initiatePayment()` | Real AddisPay API call with ADDISPAY_API_KEY |
| AddisPay webhook trigger | `POST /webhooks/addispay` with header `x-addispay-signature: sandbox-signature` | Real HMAC signature verification |
| OTP SMS delivery | `backend/src/services/auth.service.ts#requestOtp` (console.log) | SMS gateway (Twilio, Afro Messages, etc.) |

## Mobile app status
| Flow | Status |
|---|---|
| Auth (OTP request + verify) | ✅ Implemented |
| Passenger payment flow | ✅ Implemented — with QR scanner via expo-camera |
| Driver dashboard | ✅ Implemented |
| Driver QR replace | ✅ Implemented |
| expo-camera QR scan | ✅ Wired to `CameraView` in PayScreen — parses `https://paytaxi.et/t/{taxiId}` |
| Localization (react-i18next) | ✅ Implemented — English + Amharic, language switcher on Home screen |
| Universal Links (iOS/Android) | 🔲 Scaffolded in `app.json` (fill `assetlinks.json` when signing cert is ready) |

## Database
- **Provider**: SQL Server (local — `DESKTOP-SI08CAC\paytaxi`)
- **Config**: Zero-arg PrismaClient with schema URL
- **Migration status**: ✅ 3 migrations applied:
  - `20260808074951_init` — full schema
  - `20260808085150_add_check_constraints` — enum-equivalent CHECK constraints
  - `20260920120732_widen_raw_payload_columns` — `rawPayload`/`addispayRawPayload` widened to NVARCHAR(4000) so full webhook JSON fits
- **Seed**: ✅ Complete with admin (`+251911111111`), driver (`+251922222222`, `TX-1001`), and passenger (`+251933333333`)
- **To switch to Supabase/PostgreSQL**: change `provider = "postgresql"` in `schema.prisma`, delete `prisma.config.ts`, update `DATABASE_URL`

## Security & Deployment notes
- **Cookie auth (web)**: `sameSite: 'strict'` + `httpOnly` + `secure` (in production).
  - ⚠️ **`sameSite: 'strict'` requires frontend and backend to share the same registrable domain** (e.g., both on `paytaxi.et`). It will **silently fail** if deployed on unrelated domains (e.g., frontend on Vercel, backend on Heroku with different TLDs). Whoever sets up production hosting must ensure this constraint is met or switch to `sameSite: 'lax'` with appropriate CORS hardening.
- **Mobile**: Uses `expo-secure-store` for JWT. Token is sent as `Authorization: Bearer` header. Not affected by cookie constraints.
- **DB constraints**: SQL Server `CHECK` constraints on `status`, `role`, `verificationStatus` prevent invalid string values even from direct SQL queries or bugs.
- **QR codes**: Generated server-side as real PNG using `qrcode` npm package. Payload is `https://paytaxi.et/t/{taxiId}` — compatible with iOS Universal Links and Android App Links. Falls back to browser when app is not installed. (Custom schemes like `paytaxi://` would break the no-install fallback.)

- **Automated Tests**:
  - `backend/src/__tests__/fares.test.ts` — covers all valid/invalid state transitions (16 cases) + resolveFare presets/multipliers/bounds (8 cases)
  - `backend/src/__tests__/webhooks.test.ts` — covers idempotency, compare-and-set race conditions, and terminal state protection
  - `backend/src/__tests__/auth.service.test.ts` — covers OTP generation, hashing, attempt limits, expiration, and role validation
  - `backend/src/__tests__/drivers.service.test.ts` — covers registration, approval, and QR replacement flows
  - **Result**: 50 tests, 4 suites, all passing ✅


## Resolved known limitations (from previous status)
| Previously flagged | Resolution |
|---|---|
| "Webhook race — zero affected rows assumed success" | ✅ Fixed: re-reads current status, distinguishes idempotent vs conflict, logs structured warning on conflict |
| "Webhook raw payload stored as object into String field" | ✅ Fixed: `JSON.stringify` before write (`webhooks.ts`) + columns widened to NVARCHAR(4000) |
| "QR image — returns payload URL string, not an image" | ✅ Fixed: `GET /qr/:taxiId.png` returns a real scannable 512×512 PNG |
| "JWT in localStorage" | ✅ Fixed: httpOnly cookie for web, expo-secure-store for mobile |
| "Dead /frontend/app/api/** routes" | ✅ Deleted |
| "i18n not implemented" | ✅ Implemented: next-intl (frontend, wired into components), react-i18next (mobile) with en + am |
| "Camera permission fallback" | ✅ Confirmed: `mobile/App.tsx` handles denied permissions gracefully by showing a message and 'Cancel' button to fallback to manual text input. |
| "CORS config" | ✅ Confirmed: `backend/src/index.ts` explicitly checks `allowedOrigins` (including `http://localhost:3000` and expo LAN IPs) and uses `credentials: true`. |
| "Dead v0 `frontend/lib/{auth,db,drivers,payments,shared}` and `frontend/scripts/db-setup.mjs`" | ✅ Deleted. Dead deps `drizzle-orm`, `pg`, `@types/pg` removed (211 packages pruned). Package renamed `my-project` → `paytaxi-frontend`. |
| "`@paytaxi/shared` unused (dist unbuilt)" | ✅ Wired: frontend imports `FARE_PRESETS` from `@paytaxi/shared` via tsconfig path to `src` + `transpilePackages`. |
| "`pnpm.overrides` warning in frontend" | ✅ Moved `hono` override to root `package.json`. Root `pnpm.overrides` now also forces `jest-environment-node@30.4.1` (fixes the jest 29/30 moduleMocker `clearMocksOnScope` crash). |

## Known remaining gaps
- `app_session` table kept for schema compatibility but superseded by JWT — safe to drop in a future migration.
- Payout reconciliation, admin console, real AddisPay, NFC — deferred by design.

## How to run locally

```bash
# Backend (port 5000)
cd backend
# Ensure backend/.env has DATABASE_URL set
pnpm prisma:migrate   # first time: creates tables
pnpm prisma:seed      # loads test data
pnpm dev

# Run tests
cd backend
npx jest --config jest.config.json

# Frontend (port 3000)
cd frontend
# Ensure frontend/.env.local has NEXT_PUBLIC_API_URL=http://localhost:5000
pnpm dev

# Mobile
cd mobile
# Ensure mobile/.env has EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:5000
npx expo start
```
