export type UserRole = "PASSENGER" | "DRIVER" | "ADMIN"
export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED"
export type QrStatus = "ACTIVE" | "DISABLED" | "REPLACED"
export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" | "UNKNOWN"

export type PublicDriverInfo = {
  taxiId: string
  displayName: string
  plateNumber: string
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleColor: string | null
  profilePhotoUrl: string | null
  rating: number
  qrStatus: QrStatus
}

export type TransactionSummary = {
  id: string
  taxiId: string
  amount: number
  currency: string
  status: TransactionStatus
  createdAt: string
  confirmedAt: string | null
}

export type DriverDashboard = {
  driver: PublicDriverInfo
  today: { total: number; count: number; average: number }
  week: { total: number; count: number; series: { label: string; total: number }[] }
  month: { total: number; count: number }
  recent: TransactionSummary[]
  payoutStatus: "SETTLED" | "PENDING_SETTLEMENT"
}

export const FARE_PRESETS = [
  { id: "short", label: "Short Stage / ቅርብ", amount: 10, description: "1–3 km" },
  { id: "standard", label: "Standard / መደበኛ", amount: 15, description: "3–6 km" },
  { id: "medium", label: "Medium / መካከለኛ", amount: 20, description: "6–9 km" },
  { id: "long", label: "Long / ረጅም", amount: 25, description: "9–13 km" },
  { id: "express", label: "Express / ኤክስፕረስ", amount: 35, description: "13–18 km" },
  { id: "special", label: "Night / ልዩ", amount: 50, description: "Late / Long-zone" },
] as const

export type FarePresetId = (typeof FARE_PRESETS)[number]["id"]

