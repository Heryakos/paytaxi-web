type TransactionStatus = string;

export const FARE_PRESETS = [
  { id: "short", label: "Short Stage / ቅርብ", amount: 10, description: "1–3 km" },
  { id: "standard", label: "Standard / መደበኛ", amount: 15, description: "3–6 km" },
  { id: "medium", label: "Medium / መካከለኛ", amount: 20, description: "6–9 km" },
  { id: "long", label: "Long / ረጅም", amount: 25, description: "9–13 km" },
  { id: "express", label: "Express / ኤክስፕረስ", amount: 35, description: "13–18 km" },
  { id: "special", label: "Night / ልዩ", amount: 50, description: "Late / Long-zone" },
] as const;

export type FarePresetId = (typeof FARE_PRESETS)[number]["id"];

export type FareResolutionOptions = {
  presetId?: string;
  customAmount?: number;
  passengerCount?: number;
};

export function resolveFare(input: string | FareResolutionOptions) {
  if (typeof input === "string") {
    const preset = FARE_PRESETS.find((p) => p.id === input);
    if (!preset) return null;
    return {
      amount: preset.amount,
      unitAmount: preset.amount,
      passengerCount: 1,
      currency: "ETB",
      label: preset.label,
      id: preset.id
    };
  }

  const count = Math.max(1, Math.min(10, Math.floor(input.passengerCount || 1)));

  if (input.presetId) {
    const preset = FARE_PRESETS.find((p) => p.id === input.presetId);
    if (!preset) return null;
    const total = preset.amount * count;
    return {
      amount: total,
      unitAmount: preset.amount,
      passengerCount: count,
      currency: "ETB",
      label: count > 1 ? `${preset.label} (${count} seats)` : preset.label,
      id: preset.id
    };
  }

  if (typeof input.customAmount === "number" && !isNaN(input.customAmount)) {
    const custom = Math.round(input.customAmount);
    if (custom < 5 || custom > 500) return null;
    return {
      amount: custom * count,
      unitAmount: custom,
      passengerCount: count,
      currency: "ETB",
      label: count > 1 ? `Custom Fare (${count} seats)` : "Custom Fare",
      id: "custom"
    };
  }

  return null;
}


const ALLOWED: Record<TransactionStatus, TransactionStatus[]> = {
  PENDING: ["SUCCESS", "FAILED", "REFUNDED", "UNKNOWN"],
  SUCCESS: ["REFUNDED"],
  FAILED: [],
  REFUNDED: [],
  UNKNOWN: ["SUCCESS", "FAILED", "REFUNDED"],
};

export function canTransition(from: TransactionStatus, to: TransactionStatus) {
  if (from === to) return false;
  return ALLOWED[from]?.includes(to) ?? false;
}
