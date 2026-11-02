# PayTaxi Ethiopia — Real-World Deployment & Operations Manual
**Version:** 1.0.0 (Production Release)  
**Date:** October 2026  
**Repository:** `https://github.com/Heryakos/PayTaxi-Ethiopia.git`  
**Target Infrastructure:**  
- **Database:** Supabase (Managed PostgreSQL)  
- **Backend API:** Render (Web Service - Node.js / Express 5 / Prisma)  
- **Frontend Web UI:** Vercel (Next.js 16 App Router)  
- **Mobile Application:** Expo / EAS Build (Android Standalone `.apk`)  

---

## Table of Contents
1. [Architecture & Production Topology](#1-architecture--production-topology)
2. [Step 1: Database Setup on Supabase (PostgreSQL)](#2-step-1-database-setup-on-supabase-postgresql)
3. [Step 2: Deploy Backend API to Render](#3-step-2-deploy-backend-api-to-render)
4. [Step 3: Deploy Frontend Web to Vercel](#4-step-3-deploy-frontend-web-to-vercel)
5. [Step 4: Build & Install Android Mobile App (APK via EAS)](#5-step-4-build--install-android-mobile-app-apk-via-eas)
6. [Step 5: End-to-End Real-World Testing Guide](#6-step-5-end-to-end-real-world-testing-guide)
7. [Operational Workflows (Driver, Passenger, Conductor & Admin)](#7-operational-workflows)
8. [Troubleshooting & Best Practices](#8-troubleshooting--best-practices)

---

## 1. Architecture & Production Topology

```
                       ┌─────────────────────────────────────────────────────────────┐
                       │                     END USERS & DEVICES                     │
                       └─────────────────────────────────────────────────────────────┘
                                      │                               │
                      [Any Smartphone Camera / Web Browser]    [Android Phone with PayTaxi App]
                                      │                               │
                                      ▼                               ▼
                       ┌───────────────────────────────┐ ┌───────────────────────────┐
                       │   Vercel Edge Network (Web)   │ │  Standalone Android APK   │
                       │   https://paytaxi.et / Vercel │ │  (Expo EAS Build Preview) │
                       └───────────────────────────────┘ └───────────────────────────┘
                                      │                               │
                                      │ HTTPS API Requests            │ HTTPS Bearer Requests
                                      │ (Credentials / Cookie)        │ (expo-secure-store)
                                      ▼                               ▼
                       ┌─────────────────────────────────────────────────────────────┐
                       │                   Render Cloud Web Service                  │
                       │           (Express 5 + Prisma + SSE Event Hub)              │
                       │               https://paytaxi-api.onrender.com              │
                       └─────────────────────────────────────────────────────────────┘
                                      │                               │
                          Prisma Connection Pool         Server-Sent Events (SSE)
                                      │                         Stream Broadcast
                                      ▼                               ▼
                       ┌───────────────────────────────┐ ┌───────────────────────────┐
                       │      Supabase PostgreSQL      │ │    Driver Dashboard Audio  │
                       │   (AWS Region: eu-central-1)  │ │   Soundbox (Real-Time     │
                       │    Transactions & Identities  │ │   Chime & Voice Alert)    │
                       └───────────────────────────────┘ └───────────────────────────┘
```

---

## 2. Step 1: Database Setup on Supabase (PostgreSQL)

PayTaxi uses Prisma ORM. While local development uses SQL Server, production is built for **Supabase PostgreSQL**. We have prepared a dedicated turnkey PostgreSQL schema: `backend/prisma/schema.supabase.prisma`.

### 2.1 Create Supabase Project
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project**.
3. Choose your Organization, enter Project Name (e.g. `paytaxi-et`), enter a strong Database Password (store this securely), and select region (e.g., `Frankfurt / eu-central-1` or nearest to East Africa).
4. Click **Create new project** and wait ~2 minutes for provisioning.

### 2.2 Retrieve the PostgreSQL Connection String
1. In your Supabase Project dashboard, go to **Project Settings** (gear icon) -> **Database**.
2. Scroll to **Connection string** and select **URI**.
3. Copy the URI string. It has the format:
   ```text
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
   > **Note on Connection Pooling:** If using Supabase Connection Pooler (recommended for serverless/high concurrency), use port `6543` with `?pgbouncer=true`:
   > ```text
   > postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
   > ```

### 2.3 Push Schema to Supabase
On your development machine, open your terminal and run:

```bash
cd backend

# Option A: Set temporary environment variable in terminal
export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# On Windows PowerShell:
$env:DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Push schema directly to Supabase:
pnpm db:push:supabase

# Generate the PostgreSQL Prisma client:
pnpm prisma:generate:supabase
```

This automatically creates all necessary tables in Supabase:
- `app_user` (Passengers, drivers, administrators)
- `driver_profile` (Driver credentials, KYC documents, plate numbers)
- `taxi_qr` (QR records, unique human-readable Taxi IDs e.g. `TX-1001`)
- `transaction` (Financial records, status states)
- `webhook_event` (Idempotent payment callbacks)
- `otp_challenge` (SMS login challenges)

---

## 3. Step 2: Deploy Backend API to Render

Render will host the Node.js Express API server with automatic SSL and zero-downtime deploys.

### 3.1 Create Render Web Service
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository: `https://github.com/Heryakos/PayTaxi-Ethiopia.git`.
4. Configure the service settings:
   - **Name:** `paytaxi-backend` (will give URL `https://paytaxi-backend.onrender.com`)
   - **Region:** Frankfurt (EU Central) or Oregon (US West)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:**
     ```bash
     pnpm install && pnpm prisma:generate:supabase && pnpm build
     ```
   - **Start Command:**
     ```bash
     node dist/index.js
     ```

### 3.2 Environment Variables on Render
Under **Environment Variables**, add the following:

| Key | Example Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:[PASS]@db.[REF].supabase.co:5432/postgres` | Your Supabase connection string |
| `JWT_SECRET` | `pt_prod_sec_8f93e2b10a4c7e8d6f1a9b2c3d4e5f6` | Secure random key for signing JWTs |
| `NODE_ENV` | `production` | Enables production mode and cross-domain secure cookies |
| `FRONTEND_URL` | `https://paytaxi-ethiopia.vercel.app` | Your Vercel frontend URL (or custom domain) |
| `PORT` | `5000` | Express port (Render automatically routes web traffic) |

5. Click **Create Web Service**. Render will build and deploy your backend.
6. Verify deployment by opening `https://paytaxi-backend.onrender.com/health` in your browser. It should return:
   ```json
   { "status": "ok", "service": "PayTaxi Backend API", "timestamp": "..." }
   ```

---

## 4. Step 3: Deploy Frontend Web to Vercel

Vercel provides instant global CDN hosting with automatic Next.js optimization.

### 4.1 Import Repository in Vercel
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Select the `PayTaxi-Ethiopia` repository.
4. In the configuration screen:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** Click `Edit` and select `frontend`.
   - **Build Command:** `pnpm build` (default)
   - **Output Directory:** `.next` (default)

### 4.2 Set Environment Variables on Vercel
Expand **Environment Variables** and add:

| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://paytaxi-backend.onrender.com` | Use your actual Render URL (no trailing slash) |

5. Click **Deploy**. Vercel will build the Next.js application in ~45 seconds.
6. Your live web app will be accessible at: `https://paytaxi-ethiopia.vercel.app` (or your customized domain e.g. `paytaxi.et`).

---

## 5. Step 4: Build & Install Android Mobile App (APK via EAS)

To test the mobile app as a real-world Android app outside your local Wi-Fi network, build a standalone `.apk` using Expo Application Services (EAS Build).

### 5.1 Prerequisites
Ensure you have the EAS CLI installed globally:
```bash
npm install -g eas-cli
```

Log in to your Expo account:
```bash
eas login
```

### 5.2 Configure Production API in Mobile
The mobile app repository includes `mobile/eas.json` configured for standalone APK generation:
```json
{
  "cli": { "version": ">= 15.0.0" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

In `mobile/.env`, set the Render backend URL:
```env
EXPO_PUBLIC_API_URL=https://paytaxi-backend.onrender.com
```

### 5.3 Trigger the Cloud APK Build
From your terminal:
```bash
cd mobile

# Run the preview build for Android:
eas build -p android --profile preview
```

### 5.4 Install APK on Physical Android Phone
1. When EAS finishes building (typically 5–8 minutes in the cloud), it prints a direct download link and QR code in your terminal.
2. Scan the link on your Android phone or open the URL in your phone's browser.
3. Download the `.apk` file and tap **Install**.
   *(If prompted by Android, allow "Install from Unknown Sources" for your browser).*
4. Open **PayTaxi** on your Android phone!

---

## 6. Step 5: End-to-End Real-World Testing Guide

Follow this step-by-step checklist to test the complete ecosystem with physical devices:

### Test Scenario Overview
| Persona | Role / Action | Platform |
|---|---|---|
| **Admin** | Approves driver application & reviews KYC documents | Web (Desktop/Laptop) |
| **Driver** | Displays QR code & listens for Soundbox payment chime | Web or Android Phone |
| **Passenger** | Scans QR code with camera & pays fare | Android Phone (4G/5G Network) |
| **Weyala (Conductor)** | Inspects animated anti-fraud green receipt | Physical Inspection |

---

### Step-by-Step Walkthrough

#### Step A: Admin Verification Center
1. Open the web app on your laptop: `https://paytaxi-ethiopia.vercel.app`.
2. Click **Admin Review Login**.
3. Enter Admin phone: `+251911111111` and click **Send OTP**.
4. Enter the dev OTP (e.g. `123456`) and verify.
5. You are in the **Admin Review Center**:
   - View pending and approved driver applications.
   - Click **National ID** or **Driver License** buttons to preview documents.
   - Click **Approve & Issue QR** to generate an active Taxi ID (e.g. `TX-1001`).
   - Click **QR PNG** to view and print the official high-resolution QR poster.

#### Step B: Driver Prepares Vehicle & Soundbox
1. In another browser window (or on the driver's phone/tablet mounted in the taxi):
2. Log in with Driver phone: `+251922222222`.
3. The **Driver Dashboard** opens:
   - Notice the green active indicator: **🔊 Soundbox: Audio chime active**.
   - Current earnings and recent transactions are displayed.
   - Print or display the QR code for `TX-1001` on another screen/paper.

#### Step C: Passenger Scans & Pays (Real-World Android Device)
1. On your physical Android phone (using mobile data / 4G, not connected to your laptop's Wi-Fi):
2. Open the PayTaxi Android app (or open Chrome/Camera and scan the QR code `https://paytaxi.et/t/TX-1001`).
3. The **Passenger Pay** screen immediately loads taxi details:
   - Driver name: **Abebe Bikila**
   - Plate number: **B12345**
   - Taxi ID: **TX-1001**
4. Select seat count (e.g. `2 Seats`).
5. Tap a minibus stage (e.g. `Standard (መደበኛ) · 15 ETB` -> Total: `30 ETB`).
6. Tap **⚡ Simulate Success (Test Mode)** (or proceed with AddisPay sandbox checkout).

#### Step D: Anti-Fraud Weyala Receipt Display
1. Upon payment confirmation, the passenger screen immediately transforms into the dynamic **Weyala Receipt Screen**:
   - Large pulsing green checkmark banner: `● PAYMENT VERIFIED / ክፍያ ተረጋግጧል`.
   - Live ticking seconds counter: `⏱ Paid 4s ago · Active ride`.
   - Ethiopian Plate Number badge: `🚕 B12345`.
   - Amount: `30 ETB` for `2 Seats`.
   - Anti-screenshot dynamic security hash: `#PT-A82F19...`.
2. The Weyala/conductor inspects the pulsing green banner and confirms the ride.

#### Step E: Real-Time Driver Soundbox Announcement
1. Look at the Driver's dashboard on the laptop:
2. **Without refreshing the page**, the Driver Soundbox immediately triggers:
   - 🔔 **Musical double-beep chime** (587 Hz -> 880 Hz harmonic bell).
   - 🗣 **Voice Announcement**: *"Payment received: 30 Birr"*.
   - ⚡ **Pulsing notification alert banner**: *"Received +30 ETB just now from Taxi TX-1001"*.
   - Total earnings counter increments automatically: `370 ETB` -> `400 ETB`.
   - The transaction appears at the top of the recent transaction table.

---

## 7. Operational Workflows

### 7.1 Driver Onboarding Workflow
1. Driver visits PayTaxi and clicks **Driver Portal**.
2. Enters mobile phone number and verifies OTP.
3. Fills in vehicle details:
   - Full Name
   - Ethiopian Plate Number (e.g. `3-A12345 AA`)
   - Vehicle Make, Model, and Color (e.g. `Toyota HiAce White`)
4. Uploads photos of **National ID (Kebele / Fayda)** and **Driver's License**.
5. Clicks **Submit Registration**.
6. Profile enters `PENDING` review status until approved by an administrator.

### 7.2 Admin Review & QR Issuance Workflow
1. Administrator navigates to **Admin Verification Center**.
2. Filters by **Pending Review**.
3. Inspects driver credentials and clicks document preview buttons.
4. Clicks **Approve & Issue QR**.
5. The system generates:
   - A unique, human-readable Taxi ID (`TX-1002`).
   - A cryptographic QR code encoding `https://paytaxi.et/t/TX-1002`.
   - Backup alphanumeric verification code.
6. The driver's account is activated, and their QR is ready for download/printing.

### 7.3 Conductor (Weyala) Verification Rules
To prevent fraud (such as passengers showing old screenshots or fake payment receipts):
1. **Look for the ticking seconds counter:** The receipt displays live seconds since payment (`Paid 12s ago`). A static screenshot cannot tick.
2. **Check the pulsing green ripple:** The circular verified badge pulses dynamically with CSS/native animation.
3. **Verify the plate number badge:** Confirm the plate badge matches the vehicle's actual Ethiopian plate number.
4. **Driver Soundbox confirmation:** In high-volume minibuses, the driver's phone or speaker announces each payment audibly so the Weyala does not need to check every passenger's phone individually.

---

## 8. Troubleshooting & Best Practices

### Cross-Domain Cookies (Vercel + Render)
- When frontend is on `vercel.app` and backend is on `onrender.com`, browsers treat cookies as cross-site third-party cookies.
- **Solution:** In production, PayTaxi backend sets `sameSite: 'none'`, `secure: true`. Furthermore, mobile apps and strict browser environments automatically pass `Authorization: Bearer <token>` in HTTP headers, guaranteeing zero session loss.

### Supabase Connection Limits
- Supabase Free tier allows up to 60 direct connections.
- When deploying backend on Render, always use the Supabase **Session Pooler** (port `6543`) to prevent connection exhaustion.

### Render Free-Tier Web Service Sleep
- Render free-tier web services spin down after 15 minutes of inactivity. The first request after sleep may take ~30 seconds to wake up.
- **Best Practice:** Upgrade to Render Starter ($7/month) for instant, uninterrupted response times, or set up a health-check cron ping to `https://paytaxi-backend.onrender.com/health` every 10 minutes.

### Mobile Camera Permissions on Android
- If an Android user denies camera permission, PayTaxi provides a manual text input fallback (`TX-1001`) so passengers can still complete payments without scanning.

---

## 9. Summary of Automated Test Verification
Before production release, the complete test suite was executed:
```text
Test Suites: 4 passed, 4 total
Tests:       50 passed, 50 total
Snapshots:   0 total
Time:        38.532 s
```
- `webhooks.test.ts`: Idempotent AddisPay callbacks, compare-and-set race prevention, terminal state safeguards.
- `fares.test.ts`: Minibus transit fare presets (10–50 ETB), custom fare resolution, state transitions.
- `auth.service.test.ts`: OTP challenge lifecycle, SHA-256 code hashing, 3-attempt brute-force protection.
- `drivers.service.test.ts`: Driver registration, admin approval, QR generation, and lost QR replacement.
- Frontend compilation (`next build`): 100% clean production bundle.
- Mobile compilation (`tsc --noEmit`): 100% clean TypeScript build.

**PayTaxi Ethiopia is production-ready for real-world deployment.**
