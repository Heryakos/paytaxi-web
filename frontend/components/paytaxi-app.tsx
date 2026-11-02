"use client"

import { useEffect, useState, useRef } from "react"
import {
  BadgeCheck, Check, Clock3, LogOut, QrCode, ShieldCheck, Smartphone,
  WalletCards, Globe, CheckCircle2, Car, ArrowLeft, Users, Sparkles,
  Volume2, VolumeX, Shield, AlertCircle, FileText, CheckCircle, XCircle,
  RefreshCw, Upload, Eye, ExternalLink, X, Image as ImageIcon
} from "lucide-react"
import { useTranslations } from "next-intl"
import { FARE_PRESETS } from "@paytaxi/shared"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"

type UserRole = "PASSENGER" | "DRIVER" | "ADMIN"
type User = { id: string; phone: string; role: UserRole }

type TaxiPublicInfo = {
  taxiId: string
  driver: {
    displayName: string
    plateNumber: string
    vehicleMake: string | null
    vehicleModel: string | null
    vehicleColor: string | null
    rating: number
  }
}

type ReceiptData = {
  id: string
  status: string
  amount: number
  currency: string
  createdAt: string
  confirmedAt: string | null
  taxiId: string
  seats: number
  label: string
  driver: {
    displayName: string
    plateNumber: string
    vehicleMake: string | null
    vehicleModel: string | null
    vehicleColor: string | null
    rating?: number
  }
}

type DriverDashboardData = {
  driver: {
    displayName: string
    plateNumber: string
    vehicleMake: string | null
    vehicleModel: string | null
    vehicleColor: string | null
    verificationStatus: string
  }
  qr: { taxiId: string; status: string; backupCode: string | null } | null
  transactions: { id: string; amount: string; status: string; createdAt: string }[]
  total: number
  count: number
}

type AdminDriver = {
  id: string
  userId: string
  phone: string
  displayName: string
  plateNumber: string
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleColor: string | null
  verificationStatus: "PENDING" | "APPROVED" | "REJECTED"
  nationalIdUrl: string | null
  licenseUrl: string | null
  activeTaxiId: string | null
  rating: number
  createdAt: string
}

// ---------- Driver Soundbox Audio Helpers (Web Audio & Speech API) ----------
function playSoundboxChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    // Tone 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = "sine"
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0.25, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.3)

    // Tone 2: A5 (880.00 Hz) crisp chime
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = "sine"
    osc2.frequency.setValueAtTime(880, now + 0.12)
    gain2.gain.setValueAtTime(0.35, now + 0.12)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.12)
    osc2.stop(now + 0.55)
  } catch (e) {
    console.warn("Soundbox audio chime could not play:", e)
  }
}

function announcePaymentVoice(amount: number) {
  try {
    if (!("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(`Payment received: ${amount} Birr`)
    utterance.rate = 1.05
    utterance.pitch = 1.1
    utterance.volume = 1.0
    window.speechSynthesis.speak(utterance)
  } catch (e) {
    console.warn("Speech synthesis announcement error:", e)
  }
}

// ---------- API helpers (cookie-based, no localStorage) ----------
async function apiFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: "include", // send the httpOnly cookie automatically
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Request failed")
  return data
}

function postJson(path: string, payload?: unknown) {
  return apiFetch(path, { method: "POST", body: payload ? JSON.stringify(payload) : undefined })
}

// ---------- Brand ----------
function Brand() {
  const t = useTranslations("nav")
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <QrCode className="size-5" />
      </div>
      <div>
        <p className="font-mono text-sm font-bold tracking-tight">{t("brand_name")}</p>
        <p className="text-[11px] text-muted-foreground">{t("brand_tagline")}</p>
      </div>
    </div>
  )
}

// ---------- Anti-Fraud Weyala Receipt ----------
function WeyalaReceipt({
  receipt,
  onClose,
  onNewPayment,
}: {
  receipt: ReceiptData
  onClose: () => void
  onNewPayment: () => void
}) {
  const t = useTranslations("receipt")
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [currentTime, setCurrentTime] = useState("")

  useEffect(() => {
    const start = receipt.confirmedAt ? new Date(receipt.confirmedAt).getTime() : Date.now()
    const update = () => {
      const now = Date.now()
      setSecondsAgo(Math.max(0, Math.floor((now - start) / 1000)))
      setCurrentTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
      )
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [receipt.confirmedAt])

  const shortCode = `PT-${receipt.id.slice(0, 8).toUpperCase()}`

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/40 bg-card p-6 shadow-2xl sm:p-8">
        {/* Animated dynamic security watermark pattern */}
        <div className="pointer-events-none absolute -right-20 -top-20 size-60 rounded-full bg-emerald-500/10 blur-3xl animate-pulse" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 size-60 rounded-full bg-primary/10 blur-3xl" />

        {/* Big pulsing verification badge for the Weyala */}
        <div className="relative flex flex-col items-center text-center">
          <div className="relative flex size-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="size-11" />
            <span className="absolute -inset-1.5 rounded-full border-2 border-emerald-400/60 animate-ping" />
          </div>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            {t("verified_banner")}
          </div>

          <p className="mt-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            {t("weyala_instruction")}
          </p>

          {/* Live pulsing timer */}
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-1.5 font-mono text-xs font-semibold text-foreground">
            <Clock3 className="size-3.5 text-emerald-600 animate-spin" />
            <span>{t("live_timer", { seconds: secondsAgo })}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{currentTime}</span>
          </div>
        </div>

        {/* Ethiopian Minibus Amount Display */}
        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("amount_paid")}</p>
          <div className="mt-1 flex items-baseline justify-center gap-2">
            <span className="text-5xl font-black tracking-tight text-foreground">{receipt.amount}</span>
            <span className="font-mono text-xl font-bold text-emerald-600">ETB</span>
          </div>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {receipt.label} · {receipt.seats} {t("seats_paid")}
          </p>
        </div>

        {/* Taxi & Driver Identification Card */}
        <div className="mt-6 space-y-3 rounded-2xl border border-border bg-background/50 p-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="text-xs font-medium text-muted-foreground">{t("plate_label")}</span>
            <div className="inline-flex items-center gap-1.5 rounded-lg border-2 border-foreground/20 bg-muted px-2.5 py-1 font-mono text-sm font-black tracking-wider text-foreground">
              <Car className="size-4 text-primary" />
              <span>{receipt.driver.plateNumber || receipt.taxiId}</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
            <span className="text-xs font-medium text-muted-foreground">{t("taxi_id_label")}</span>
            <span className="font-mono font-bold text-primary">{receipt.taxiId}</span>
          </div>

          <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
            <span className="text-xs font-medium text-muted-foreground">{t("driver_label")}</span>
            <span className="font-semibold text-foreground">{receipt.driver.displayName}</span>
          </div>

          {receipt.driver.vehicleMake && (
            <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Vehicle</span>
              <span className="text-xs text-muted-foreground">
                {receipt.driver.vehicleMake} {receipt.driver.vehicleModel || ""} {receipt.driver.vehicleColor ? `(${receipt.driver.vehicleColor})` : ""}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            <span>{t("security_hash")}</span>
            <span className="font-mono font-semibold tracking-wider text-foreground">{shortCode}</span>
          </div>
        </div>

        {/* Anti-fraud note */}
        <p className="mt-4 text-center text-[11px] leading-4 text-muted-foreground">
          {t("anti_fraud_notice")}
        </p>

        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-95"
          >
            {t("done_btn")}
          </button>
          <button
            onClick={onNewPayment}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("new_payment")}
          </button>
        </div>
      </div>
    </main>
  )
}

// ---------- Passenger Pay (Guest & Logged-in) ----------
function PassengerPay({
  user,
  onBack,
  initialTaxiId,
  onReceipt,
}: {
  user: User | null
  onBack: () => void
  initialTaxiId?: string
  onReceipt: (receipt: ReceiptData) => void
}) {
  const t = useTranslations("payment")
  const [taxiId, setTaxiId] = useState(initialTaxiId ?? "TX-1001")
  const [taxiDetails, setTaxiDetails] = useState<TaxiPublicInfo | null>(null)
  const [fareMode, setFareMode] = useState<"preset" | "custom">("preset")
  const [farePresetId, setFarePresetId] = useState<string>("standard")
  const [customAmount, setCustomAmount] = useState<string>("15")
  const [passengerCount, setPassengerCount] = useState<number>(1)
  const [passengerPhone, setPassengerPhone] = useState<string>("")
  const [state, setState] = useState<"idle" | "pending" | "simulating" | "error">("idle")
  const [message, setMessage] = useState("")

  // Fetch driver details for this taxi
  useEffect(() => {
    if (!taxiId || taxiId.length < 3) return
    apiFetch(`/qr/${taxiId.trim().toUpperCase()}`)
      .then((data: TaxiPublicInfo) => setTaxiDetails(data))
      .catch(() => setTaxiDetails(null))
  }, [taxiId])

  // Calculate live total
  const selectedPreset = FARE_PRESETS.find((p) => p.id === farePresetId) || FARE_PRESETS[1]
  const unitAmount = fareMode === "preset" ? selectedPreset.amount : (Number(customAmount) || 0)
  const totalAmount = unitAmount * passengerCount

  const handlePay = async (simulate: boolean = false) => {
    try {
      setMessage("")
      setState(simulate ? "simulating" : "pending")

      const payload = {
        taxiId: taxiId.trim().toUpperCase(),
        farePresetId: fareMode === "preset" ? farePresetId : undefined,
        customAmount: fareMode === "custom" ? Number(customAmount) : undefined,
        passengerCount,
        passengerPhone: passengerPhone.trim() || undefined,
      }

      const initData = await postJson("/payments/initiate", payload)

      if (simulate) {
        // Direct sandbox instant simulation for testing & immediate receipt rendering
        const simResult = await postJson(`/payments/${initData.transactionId}/simulate-success`)
        onReceipt({
          id: simResult.transaction.id,
          status: simResult.transaction.status,
          amount: simResult.transaction.amount,
          currency: simResult.transaction.currency,
          createdAt: simResult.transaction.createdAt,
          confirmedAt: simResult.transaction.confirmedAt,
          taxiId: simResult.transaction.taxiId,
          seats: passengerCount,
          label: initData.fare.label,
          driver: simResult.transaction.driver,
        })
      } else {
        if (initData.checkoutUrl && initData.checkoutUrl.startsWith("http")) {
          window.location.href = initData.checkoutUrl
        } else {
          setMessage(`Transaction created: ${initData.transactionId}. Amount: ${totalAmount} ETB.`)
          setState("idle")
        }
      }
    } catch (e) {
      setState("error")
      setMessage((e as Error).message)
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <button onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {t("guest_notice")}
          </span>
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>

        {/* Scanned Taxi Card */}
        <div className="mt-6 rounded-2xl border border-border bg-background p-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="taxiId">
            {t("taxi_id_label")}
          </label>
          <input
            id="taxiId"
            value={taxiId}
            onChange={(e) => setTaxiId(e.target.value.toUpperCase())}
            placeholder="e.g. TX-1001"
            className="mt-1.5 w-full rounded-xl border border-border bg-card px-4 py-2.5 font-mono text-lg font-bold tracking-wider"
          />

          {taxiDetails && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/5 px-3.5 py-2 text-xs">
              <div>
                <span className="font-semibold text-foreground">{taxiDetails.driver.displayName}</span>
                <span className="text-muted-foreground"> · {taxiDetails.driver.vehicleMake} {taxiDetails.driver.vehicleColor}</span>
              </div>
              <span className="rounded-md border border-primary/20 bg-card px-2 py-0.5 font-mono font-bold text-primary">
                {taxiDetails.driver.plateNumber}
              </span>
            </div>
          )}
        </div>

        {/* Fare Mode Selector Tabs */}
        <div className="mt-6 flex rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setFareMode("preset")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
              fareMode === "preset" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("presets_tab")}
          </button>
          <button
            type="button"
            onClick={() => setFareMode("custom")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
              fareMode === "custom" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("custom_fare_tab")}
          </button>
        </div>

        {/* Preset Minibus Stages Grid */}
        {fareMode === "preset" ? (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {FARE_PRESETS.map((fare) => {
              const active = farePresetId === fare.id
              return (
                <button
                  key={fare.id}
                  type="button"
                  onClick={() => setFarePresetId(fare.id)}
                  className={`rounded-2xl border p-3.5 text-left transition-all ${
                    active
                      ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                      : "border-border bg-background hover:border-primary/50"
                  }`}
                >
                  <p className="text-xs font-semibold text-foreground line-clamp-1">{fare.label}</p>
                  <p className="mt-1 font-mono text-lg font-bold text-primary">{fare.amount} <span className="text-xs font-normal">ETB</span></p>
                  {"description" in fare && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{(fare as any).description}</p>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-border bg-background p-4">
            <label className="block text-xs font-semibold text-muted-foreground" htmlFor="customAmount">
              Enter Fare Amount (ETB)
            </label>
            <div className="relative mt-2">
              <input
                id="customAmount"
                type="number"
                min={5}
                max={500}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={t("custom_placeholder")}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 font-mono text-xl font-bold"
              />
              <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-muted-foreground">ETB</span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("custom_min_max")}</p>
          </div>
        )}

        {/* Passenger Seats Multiplier */}
        <div className="mt-5 rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("seats_label")}</p>
              <p className="text-[11px] text-muted-foreground">Paying for someone else? Add seats</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPassengerCount((c) => Math.max(1, c - 1))}
                className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-base font-bold text-foreground hover:bg-muted"
                disabled={passengerCount <= 1}
              >
                -
              </button>
              <span className="min-w-6 text-center font-mono text-base font-bold text-foreground">
                {passengerCount}
              </span>
              <button
                type="button"
                onClick={() => setPassengerCount((c) => Math.min(10, c + 1))}
                className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-base font-bold text-foreground hover:bg-muted"
              >
                +
              </button>
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            {[1, 2, 3, 4].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setPassengerCount(num)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  passengerCount === num ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {num} {num === 1 ? "seat" : "seats"}
              </button>
            ))}
          </div>
        </div>

        {/* Optional phone number for SMS receipt */}
        <div className="mt-5">
          <label className="block text-xs font-semibold text-muted-foreground" htmlFor="passengerPhone">
            {t("phone_optional_label")}
          </label>
          <input
            id="passengerPhone"
            value={passengerPhone}
            onChange={(e) => setPassengerPhone(e.target.value)}
            placeholder={t("phone_optional_placeholder")}
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
          />
        </div>

        {/* Total Summary Box */}
        <div className="mt-6 flex items-center justify-between rounded-2xl bg-primary/10 px-5 py-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("total_due")}</span>
            <p className="text-xs text-muted-foreground">
              {passengerCount > 1 ? `${passengerCount} seats × ${unitAmount} ETB` : "1 passenger"}
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-black text-foreground">{totalAmount}</span>
            <span className="ml-1 font-mono text-sm font-bold text-primary">ETB</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            disabled={state === "pending" || state === "simulating" || totalAmount < 5}
            onClick={() => handlePay(false)}
            className="w-full rounded-xl bg-primary px-4 py-3.5 font-bold text-primary-foreground shadow-md transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {state === "pending" ? t("pending_btn") : t("pay_now", { amount: totalAmount })}
          </button>

          {/* Test mode instant confirmation button */}
          <button
            type="button"
            disabled={state === "pending" || state === "simulating" || totalAmount < 5}
            onClick={() => handlePay(true)}
            className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300 disabled:opacity-60"
          >
            {state === "simulating" ? t("simulating") : t("simulate_btn")}
          </button>
        </div>

        {message && (
          <div className={`mt-4 rounded-xl p-3.5 text-xs ${state === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-100 text-emerald-900"}`}>
            {message}
          </div>
        )}

        {user && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t("signed_in_as")} {user.phone}
          </p>
        )}
      </div>
    </main>
  )
}

// ---------- OTP Auth ----------
function OtpAuth({ role, onSuccess, onBack }: { role: UserRole; onSuccess: (user: User) => void; onBack: () => void }) {
  const t = useTranslations("auth")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const request = async () => {
    try { setError(""); setLoading(true); const data = await postJson("/auth/request-otp", { phone, role }); setChallengeId(data.challengeId); setDevCode(data.code) }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }
  const verify = async () => {
    try {
      setError(""); setLoading(true)
      const data = await postJson("/auth/verify-otp", { challengeId, code })
      onSuccess(data.user)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col px-4 py-16 sm:px-8">
      <button onClick={onBack} className="mb-8 text-left text-sm font-semibold text-muted-foreground">← Back</button>
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Smartphone className="size-9 text-primary" />
        <h1 className="mt-5 text-3xl font-bold tracking-tight">{role === "DRIVER" ? t("title_driver") : t("title_passenger")}</h1>
        <p className="mt-3 leading-6 text-muted-foreground">{t("subtitle")}</p>
        {!challengeId ? (
          <>
            <label className="mt-8 block text-sm font-semibold" htmlFor="phone">{t("phone_label")}</label>
            <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phone_placeholder")} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3" />
            <button onClick={request} disabled={loading} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60">
              {loading ? t("sending") : t("send_otp")}
            </button>
          </>
        ) : (
          <>
            {devCode && <div className="mt-6 rounded-xl bg-primary/10 p-4 text-sm">{t("dev_otp")} <strong className="font-mono">{devCode}</strong></div>}
            <label className="mt-6 block text-sm font-semibold" htmlFor="otp">{t("otp_label")}</label>
            <input id="otp" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-mono tracking-[0.3em]" />
            <button onClick={verify} disabled={loading} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60">
              {loading ? t("verifying") : t("verify")}
            </button>
          </>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </main>
  )
}

// ---------- Driver Registration with KYC Document Upload ----------
function DriverRegistration({ onDone }: { onDone: (data: DriverDashboardData) => void }) {
  const t = useTranslations("registration")
  const [form, setForm] = useState({
    name: "",
    vehicleMake: "Toyota",
    vehicleModel: "Corolla",
    vehicleColor: "White",
    plateNumber: "",
    nationalIdUrl: "",
    licenseUrl: "",
  })
  const [idPreview, setIdPreview] = useState<string | null>(null)
  const [licensePreview, setLicensePreview] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: "id" | "license") => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      if (field === "id") {
        setIdPreview(result)
        setForm((prev) => ({ ...prev, nationalIdUrl: result }))
      } else {
        setLicensePreview(result)
        setForm((prev) => ({ ...prev, licenseUrl: result }))
      }
    }
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    try {
      setError("")
      setLoading(true)
      const result = await postJson("/drivers/register", form)
      onDone({ driver: result.driver, qr: null, transactions: [], total: 0, count: 0 })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          <Shield className="size-3.5" />
          <span>{t("label")}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Full Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Abebe Kebede"
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>

          <label className="text-sm font-semibold">
            Plate Number
            <input
              value={form.plateNumber}
              onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
              placeholder="3-A12345 AA"
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>

          <label className="text-sm font-semibold">
            Vehicle Make
            <input
              value={form.vehicleMake}
              onChange={(e) => setForm({ ...form, vehicleMake: e.target.value })}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </label>

          <label className="text-sm font-semibold">
            Vehicle Model
            <input
              value={form.vehicleModel}
              onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </label>

          <label className="text-sm font-semibold">
            Vehicle Color
            <input
              value={form.vehicleColor}
              onChange={(e) => setForm({ ...form, vehicleColor: e.target.value })}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </label>

          <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2 pt-2 border-t border-border">
            {/* National ID Upload */}
            <div className="rounded-2xl border border-dashed border-border p-4 bg-muted/20">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {t("mock_id")} (Kebele / Fayda)
              </label>
              {idPreview ? (
                <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="flex items-center gap-3">
                    <img src={idPreview} alt="National ID" className="size-14 rounded-lg object-cover border border-border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <CheckCircle className="size-3.5" /> Document Ready
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">National ID uploaded</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setIdPreview(null); setForm(p => ({ ...p, nationalIdUrl: "" })) }}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="size-5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-primary">Upload National ID Image</span>
                  <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "id")} className="hidden" />
                </label>
              )}
            </div>

            {/* Driver License Upload */}
            <div className="rounded-2xl border border-dashed border-border p-4 bg-muted/20">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {t("mock_license")}
              </label>
              {licensePreview ? (
                <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="flex items-center gap-3">
                    <img src={licensePreview} alt="License" className="size-14 rounded-lg object-cover border border-border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <CheckCircle className="size-3.5" /> Document Ready
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">Driver License uploaded</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setLicensePreview(null); setForm(p => ({ ...p, licenseUrl: "" })) }}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="size-5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-primary">Upload Driver License Image</span>
                  <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "license")} className="hidden" />
                </label>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={submit}
          disabled={loading || !form.name || !form.plateNumber}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-3.5 font-bold text-primary-foreground shadow-md transition-opacity hover:opacity-95 disabled:opacity-60"
        >
          {loading ? t("submitting") : t("submit")}
        </button>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </main>
  )
}

// ---------- Driver Dashboard with Real-Time Soundbox ----------
function DriverDashboard({
  data,
  onRefresh,
  onLogout,
}: {
  data: DriverDashboardData
  onRefresh: () => void
  onLogout: () => void
}) {
  const t = useTranslations("dashboard")
  const [currentData, setCurrentData] = useState<DriverDashboardData>(data)
  const [replacing, setReplacing] = useState(false)
  const [soundboxEnabled, setSoundboxEnabled] = useState(true)
  const [latestAlert, setLatestAlert] = useState<{ amount: number; taxiId: string; time: string } | null>(null)

  // Keep internal state synced when parent data updates
  useEffect(() => {
    setCurrentData(data)
  }, [data])

  // Real-time EventSource listener for SSE payment broadcasts
  useEffect(() => {
    let eventSource: EventSource | null = null
    try {
      eventSource = new EventSource(`${API}/dashboard/stream`, { withCredentials: true })

      eventSource.onopen = () => {
        console.log("Soundbox SSE stream connected")
      }

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === "PAYMENT_SUCCESS") {
            const amountNum = Number(payload.amount)

            if (soundboxEnabled) {
              playSoundboxChime()
              setTimeout(() => {
                announcePaymentVoice(amountNum)
              }, 400)
            }

            setLatestAlert({
              amount: amountNum,
              taxiId: payload.taxiId,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            })

            setCurrentData((prev) => ({
              ...prev,
              total: prev.total + amountNum,
              count: prev.count + 1,
              transactions: [
                {
                  id: payload.transactionId,
                  amount: String(amountNum),
                  status: "SUCCESS",
                  createdAt: payload.timestamp || new Date().toISOString(),
                },
                ...prev.transactions,
              ],
            }))
          }
        } catch (err) {
          console.error("SSE parse error:", err)
        }
      }

      eventSource.onerror = (err) => {
        console.warn("Soundbox SSE connection retry:", err)
      }
    } catch (err) {
      console.warn("Could not start SSE:", err)
    }

    return () => {
      if (eventSource) eventSource.close()
    }
  }, [soundboxEnabled])

  const replaceQr = async () => {
    try {
      setReplacing(true)
      await postJson("/qr/replace")
      onRefresh()
    } catch {
      /* ignore */
    } finally {
      setReplacing(false)
    }
  }

  const toggleSoundbox = () => {
    const next = !soundboxEnabled
    setSoundboxEnabled(next)
    if (next) {
      playSoundboxChime() // trigger test chime so audio context unlocks
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      {/* Real-time Payment Notification Banner */}
      {latestAlert && (
        <div className="mb-6 overflow-hidden rounded-2xl border-2 border-emerald-500 bg-emerald-500/15 p-4 shadow-lg animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md">
                <Sparkles className="size-6 animate-spin" />
              </div>
              <div>
                <p className="text-base font-bold text-emerald-950 dark:text-emerald-100">
                  {t("payment_alert", { amount: latestAlert.amount })}
                </p>
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  Taxi {latestAlert.taxiId} · Received at {latestAlert.time}
                </p>
              </div>
            </div>
            <button
              onClick={() => setLatestAlert(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Car className="size-3.5" />
            <span>{t("label")}</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold">{t("welcome", { name: currentData.driver.displayName })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Soundbox toggle button */}
          <button
            type="button"
            onClick={toggleSoundbox}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all shadow-sm ${
              soundboxEnabled
                ? "border-2 border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                : "border border-border bg-muted/60 text-muted-foreground"
            }`}
          >
            {soundboxEnabled ? (
              <>
                <Volume2 className="size-4 text-emerald-600 animate-pulse" />
                <span>{t("soundbox_active")}</span>
              </>
            ) : (
              <>
                <VolumeX className="size-4 text-muted-foreground" />
                <span>{t("soundbox_muted")}</span>
              </>
            )}
          </button>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:bg-muted"
          >
            <LogOut className="size-3.5" />
            {t("log_out")}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <WalletCards className="size-5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total</span>
          </div>
          <p className="mt-4 text-3xl font-extrabold tracking-tight">{currentData.total.toLocaleString()} ETB</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("earnings")}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <Check className="size-5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Count</span>
          </div>
          <p className="mt-4 text-3xl font-extrabold tracking-tight">{currentData.count}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("payments")}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <QrCode className="size-5 text-primary" />
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              currentData.qr?.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700"
            }`}>
              {currentData.qr?.status ?? currentData.driver.verificationStatus}
            </span>
          </div>
          <p className="mt-4 font-mono text-2xl font-bold text-primary">{currentData.qr?.taxiId ?? t("no_qr")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Plate: {currentData.driver.plateNumber}</p>
          {currentData.qr?.taxiId && (
            <a
              href={`${API}/qr/${currentData.qr.taxiId}.png`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <ExternalLink className="size-3" />
              {t("download_qr")}
            </a>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={replaceQr}
          disabled={replacing}
          className="rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
        >
          {replacing ? t("replacing") : t("report_lost")}
        </button>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-95"
        >
          <RefreshCw className="size-3.5" />
          {t("refresh")}
        </button>
      </div>

      {/* Recent Transactions List */}
      <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="font-bold text-sm">{t("recent_tx")}</h2>
          <span className="text-xs text-muted-foreground font-mono">{currentData.transactions.length} total</span>
        </div>
        <div className="mt-4 flex flex-col divide-y divide-border">
          {currentData.transactions.length ? (
            currentData.transactions.map((row) => (
              <div key={row.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <span className="font-mono text-xs font-semibold text-foreground">{row.id.slice(0, 14)}…</span>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-base">{row.amount} ETB</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    row.status === "SUCCESS"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {row.status}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("no_tx")}</p>
          )}
        </div>
      </section>
    </main>
  )
}

// ---------- Admin Driver Verification & KYC Review Portal ----------
function AdminPortal({ onRefresh, onLogout }: { onRefresh: () => void; onLogout: () => void }) {
  const t = useTranslations("admin")
  const [drivers, setDrivers] = useState<AdminDriver[]>([])
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL")
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string } | null>(null)
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)

  const fetchDrivers = async () => {
    try {
      setLoading(true)
      const data = await apiFetch("/drivers/admin/all")
      setDrivers(data.drivers || [])
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDrivers()
  }, [])

  const handleApprove = async (driverId: string) => {
    try {
      setActionLoading(driverId)
      setMessage(null)
      const res = await postJson(`/drivers/${driverId}/approve`)
      setMessage({ text: `Driver approved! QR Code ${res.qr?.taxiId} created.`, type: "success" })
      await fetchDrivers()
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" })
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (driverId: string) => {
    try {
      setActionLoading(driverId)
      setMessage(null)
      await postJson(`/drivers/${driverId}/reject`, { reason: "Documents did not pass verification." })
      setMessage({ text: "Driver application rejected.", type: "success" })
      await fetchDrivers()
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" })
    } finally {
      setActionLoading(null)
    }
  }

  const filteredDrivers = drivers.filter((d) => {
    if (filter === "ALL") return true
    return d.verificationStatus === filter
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="size-3.5" />
            <span>Admin Review Center</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchDrivers}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-muted"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </button>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-muted"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>

      {/* Toast message */}
      {message && (
        <div className={`mt-4 rounded-xl p-3.5 text-xs font-semibold ${
          message.type === "success" ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30" : "bg-destructive/15 text-destructive border border-destructive/30"
        }`}>
          {message.text}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-border pb-3">
        {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((tab) => {
          const count = tab === "ALL" ? drivers.length : drivers.filter((d) => d.verificationStatus === tab).length
          const labels: Record<string, string> = {
            ALL: t("all_tab"),
            PENDING: t("pending_tab"),
            APPROVED: t("approved_tab"),
            REJECTED: t("rejected_tab"),
          }
          return (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                filter === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {labels[tab]} ({count})
            </button>
          )
        })}
      </div>

      {/* Drivers List */}
      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Clock3 className="size-6 animate-spin text-primary" />
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            {t("no_drivers")}
          </div>
        ) : (
          filteredDrivers.map((driver) => (
            <div
              key={driver.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-foreground">{driver.displayName}</h3>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      driver.verificationStatus === "APPROVED"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                        : driver.verificationStatus === "PENDING"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                        : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                    }`}>
                      {driver.verificationStatus}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Phone: <strong className="font-mono text-foreground">{driver.phone}</strong></span>
                    <span>Plate: <strong className="font-mono text-foreground">{driver.plateNumber}</strong></span>
                    <span>Vehicle: <strong className="text-foreground">{driver.vehicleMake} {driver.vehicleModel} ({driver.vehicleColor})</strong></span>
                    {driver.activeTaxiId && (
                      <span>Taxi ID: <strong className="font-mono text-primary font-bold">{driver.activeTaxiId}</strong></span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {driver.activeTaxiId && (
                    <a
                      href={`${API}/qr/${driver.activeTaxiId}.png`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      <QrCode className="size-3.5 text-primary" /> QR PNG
                    </a>
                  )}

                  {driver.verificationStatus !== "APPROVED" && (
                    <button
                      onClick={() => handleApprove(driver.id)}
                      disabled={actionLoading === driver.id}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
                    >
                      <CheckCircle className="size-3.5" />
                      {actionLoading === driver.id ? t("approving") : t("approve_btn")}
                    </button>
                  )}

                  {driver.verificationStatus !== "REJECTED" && (
                    <button
                      onClick={() => handleReject(driver.id)}
                      disabled={actionLoading === driver.id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 disabled:opacity-60"
                    >
                      <XCircle className="size-3.5" />
                      {actionLoading === driver.id ? t("rejecting") : t("reject_btn")}
                    </button>
                  )}
                </div>
              </div>

              {/* Document Previews */}
              <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3">
                {driver.nationalIdUrl ? (
                  <button
                    onClick={() => setPreviewDoc({ title: `${driver.displayName} - National ID`, url: driver.nationalIdUrl! })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Eye className="size-3.5 text-primary" /> {t("id_document")}
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground italic">No National ID uploaded</span>
                )}

                {driver.licenseUrl ? (
                  <button
                    onClick={() => setPreviewDoc({ title: `${driver.displayName} - Driver License`, url: driver.licenseUrl! })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Eye className="size-3.5 text-primary" /> {t("license_document")}
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground italic">No License uploaded</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative max-w-2xl w-full rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="text-sm font-bold">{previewDoc.title}</h4>
              <button onClick={() => setPreviewDoc(null)} className="rounded-lg p-1 hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center">
              <img
                src={previewDoc.url}
                alt={previewDoc.title}
                className="max-h-[60vh] rounded-xl object-contain border border-border shadow-sm"
              />
            </div>
            <div className="mt-4 text-right">
              <button
                onClick={() => setPreviewDoc(null)}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

// ---------- Root App ----------
export default function PayTaxiApp({ initialTaxiId }: { initialTaxiId?: string }) {
  const tHome = useTranslations("home")
  const tNav = useTranslations("nav")
  const tTaxi = useTranslations("taxi")
  const [view, setView] = useState<"loading" | "home" | "auth" | "pay" | "receipt" | "driver-register" | "dashboard" | "admin">("loading")
  const [authRole, setAuthRole] = useState<UserRole>("PASSENGER")
  const [user, setUser] = useState<User | null>(null)
  const [dashboard, setDashboard] = useState<DriverDashboardData | null>(null)
  const [taxiInfo, setTaxiInfo] = useState<TaxiPublicInfo | null>(null)
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)

  // Load public driver info for the QR deep-link page (/t/{taxiId})
  useEffect(() => {
    if (!initialTaxiId) return
    apiFetch(`/qr/${initialTaxiId}`)
      .then((d: TaxiPublicInfo) => setTaxiInfo(d))
      .catch(() => setTaxiInfo(null))
  }, [initialTaxiId])

  // Restore session via GET /auth/me
  useEffect(() => {
    apiFetch("/auth/me")
      .then((data: { user: User }) => {
        setUser(data.user)
        if (data.user.role === "ADMIN" || data.user.phone === "+251911111111") {
          setView("admin")
        } else if (data.user.role === "DRIVER") {
          return apiFetch("/dashboard").then((d) => { setDashboard(d); setView("dashboard") })
        } else if (initialTaxiId) {
          setView("pay")
        } else {
          setView("home")
        }
      })
      .catch(() => {
        if (initialTaxiId) {
          setView("pay") // Guest passenger goes straight to pay
        } else {
          setView("home")
        }
      })
  }, [initialTaxiId])

  const loadDashboard = async () => {
    try {
      const data = await apiFetch("/dashboard")
      setDashboard(data)
      setView("dashboard")
    } catch {
      setView("driver-register")
    }
  }

  const signOut = async () => {
    await postJson("/auth/logout").catch(() => {})
    setUser(null)
    setDashboard(null)
    setView("home")
  }

  const authenticated = (nextUser: User) => {
    setUser(nextUser)
    if (nextUser.role === "ADMIN" || nextUser.phone === "+251911111111") {
      setView("admin")
    } else if (nextUser.role === "DRIVER") {
      void loadDashboard()
    } else {
      setView("pay")
    }
  }

  const toggleLanguage = () => {
    const isAm = document.cookie.includes("NEXT_LOCALE=am")
    document.cookie = `NEXT_LOCALE=${isAm ? "en" : "am"}; path=/; max-age=31536000`
    window.location.reload()
  }

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Clock3 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  const isAdmin = user?.role === "ADMIN" || user?.phone === "+251911111111"

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-8">
        <div className="flex items-center gap-6">
          <Brand />
          {/* Quick tab switcher when logged in */}
          {user && (
            <nav className="hidden md:flex items-center gap-1.5 text-xs font-semibold">
              <button
                onClick={() => setView("pay")}
                className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                  view === "pay" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pay Taxi
              </button>
              {(user.role === "DRIVER" || isAdmin) && (
                <button
                  onClick={() => {
                    if (dashboard) setView("dashboard")
                    else void loadDashboard()
                  }}
                  className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                    view === "dashboard" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Driver Dashboard
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setView("admin")}
                  className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                    view === "admin" ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Admin Verification
                </button>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Globe className="size-3.5" />
            <span className="hidden sm:inline">English / አማርኛ</span>
          </button>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-block rounded-full bg-muted px-2.5 py-1 text-[11px] font-mono font-medium text-muted-foreground">
                  {user.phone} ({user.role})
                </span>
                <button
                  onClick={signOut}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => { setAuthRole("PASSENGER"); setView("auth") }}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                >
                  {tHome("passenger_login")}
                </button>
                <button
                  onClick={() => { setAuthRole("DRIVER"); setView("auth") }}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95"
                >
                  {tHome("driver_portal")}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {view === "home" && (
        <main className="mx-auto max-w-5xl px-4 py-20 sm:px-8">
          {taxiInfo && (
            <div className="mb-10 rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                    <BadgeCheck className="size-3.5" />{tTaxi("verified")}
                  </div>
                  <h2 className="mt-4 text-2xl font-bold">{taxiInfo.taxiId} · {taxiInfo.driver.displayName}</h2>
                  <p className="mt-2 text-muted-foreground">
                    {taxiInfo.driver.plateNumber} · {taxiInfo.driver.vehicleMake ?? ""} {taxiInfo.driver.vehicleModel ?? ""} {taxiInfo.driver.vehicleColor ?? ""}
                  </p>
                </div>
                <button
                  onClick={() => setView("pay")}
                  className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
                >
                  {tTaxi("pay")}
                </button>
              </div>
            </div>
          )}
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
              <BadgeCheck className="size-3.5" />{tHome("tagline")}
            </div>
            <h1 className="mt-6 text-5xl font-bold tracking-tight text-balance sm:text-6xl">{tHome("heading")}</h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">{tHome("description")}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button
                onClick={() => setView("pay")}
                className="rounded-xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
              >
                {tHome("pay_btn")}
              </button>
              <button
                onClick={() => { setAuthRole("DRIVER"); setView("auth") }}
                className="rounded-xl border border-border px-5 py-3.5 font-semibold transition-colors hover:bg-muted"
              >
                {tHome("driver_btn")}
              </button>
              {/* Dev quick-access for admin testing */}
              <button
                onClick={() => { setAuthRole("ADMIN"); setView("auth") }}
                className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
              >
                Admin Review Login
              </button>
            </div>
          </div>
        </main>
      )}

      {view === "auth" && <OtpAuth role={authRole} onSuccess={authenticated} onBack={() => setView("home")} />}

      {view === "pay" && (
        <PassengerPay
          user={user}
          onBack={() => setView("home")}
          initialTaxiId={initialTaxiId}
          onReceipt={(receipt) => {
            setReceiptData(receipt)
            setView("receipt")
          }}
        />
      )}

      {view === "receipt" && receiptData && (
        <WeyalaReceipt
          receipt={receiptData}
          onClose={() => setView("home")}
          onNewPayment={() => setView("pay")}
        />
      )}

      {view === "driver-register" && (
        <DriverRegistration
          onDone={(data) => {
            setDashboard(data)
            setView("dashboard")
          }}
        />
      )}

      {view === "dashboard" && dashboard && (
        <DriverDashboard
          data={dashboard}
          onRefresh={loadDashboard}
          onLogout={signOut}
        />
      )}

      {view === "admin" && (
        <AdminPortal
          onRefresh={loadDashboard}
          onLogout={signOut}
        />
      )}

      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
        PayTaxi Ethiopia · AddisPay sandbox · Backend: {API}
      </footer>
    </div>
  )
}

