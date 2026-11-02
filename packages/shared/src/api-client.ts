const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

// Mobile-only: in-memory token for Bearer header (mobile uses expo-secure-store externally)
let _mobileToken: string | null = null

export function setMobileToken(token: string | null) {
  _mobileToken = token
}

export function getMobileToken(): string | null {
  return _mobileToken
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  // For web: the httpOnly cookie is sent automatically via credentials:'include'
  // For mobile (SSR/non-browser): include Bearer token if set
  if (_mobileToken) headers['Authorization'] = `Bearer ${_mobileToken}`

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    // Send cookies on cross-origin requests (required for httpOnly cookie auth on web)
    credentials: 'include',
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

export const api = {
  auth: {
    requestOtp: (phone: string, role: string) =>
      request<{ challengeId: string; code: string; expiresInSeconds: number }>(
        '/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone, role }) }
      ),
    verifyOtp: (challengeId: string, code: string) =>
      request<{ user: { id: string; phone: string; role: string }; token: string }>(
        '/auth/verify-otp', { method: 'POST', body: JSON.stringify({ challengeId, code }) }
      ),
    me: () =>
      request<{ user: { id: string; phone: string; role: string; isVerified: boolean } }>(
        '/auth/me'
      ),
    logout: () =>
      request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  },
  drivers: {
    register: (data: {
      name: string;
      vehicleMake: string;
      vehicleModel: string;
      vehicleColor: string;
      plateNumber: string;
      nationalIdUrl?: string;
      licenseUrl?: string;
    }) =>
      request<{ driver: unknown }>('/drivers/register', { method: 'POST', body: JSON.stringify(data) }),
    profile: () => request<{ profile: unknown }>('/drivers/profile'),
    listAll: (status?: string) =>
      request<{ drivers: Array<{
        id: string;
        userId: string;
        phone: string;
        displayName: string;
        plateNumber: string;
        vehicleMake: string | null;
        vehicleModel: string | null;
        vehicleColor: string | null;
        verificationStatus: string;
        nationalIdUrl: string | null;
        licenseUrl: string | null;
        activeTaxiId: string | null;
        rating: number;
        createdAt: string;
      }> }>(`/drivers/admin/all${status ? `?status=${status}` : ''}`),
    approve: (id: string) => request<unknown>(`/drivers/${id}/approve`, { method: 'POST' }),
    reject: (id: string, reason?: string) => request<unknown>(`/drivers/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    upload: (dataUrl: string, docType?: string) =>
      request<{ url: string; docType: string }>(`/drivers/upload`, { method: 'POST', body: JSON.stringify({ dataUrl, docType }) }),
  },
  dashboard: {
    get: () => request<unknown>('/dashboard'),
    streamUrl: (token?: string) => `${API_BASE}/dashboard/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  },

  qr: {
    replace: () => request<{ qr: unknown }>('/qr/replace', { method: 'POST' }),
    /** Returns the URL of the QR PNG — use in an <img> src */
    imageUrl: (taxiId: string) => `${API_BASE}/qr/${taxiId}.png`,
  },
  payments: {
    initiate: (options: {
      taxiId: string;
      farePresetId?: string;
      customAmount?: number;
      passengerCount?: number;
      passengerPhone?: string;
      returnUrl?: string;
    }) =>
      request<{
        transactionId: string;
        fare: { amount: number; unitAmount?: number; passengerCount?: number; currency: string; label: string; id: string };
        checkoutUrl: string;
        providerReference: string;
        taxi: { taxiId: string; driverName: string; plateNumber: string; vehicleMake: string | null; vehicleModel: string | null; vehicleColor: string | null };
      }>('/payments/initiate', { method: 'POST', body: JSON.stringify(options) }),
    getStatus: (id: string) =>
      request<{
        transaction: {
          id: string;
          status: string;
          amount: number;
          currency: string;
          createdAt: string;
          confirmedAt: string | null;
          taxiId: string;
          driver: {
            displayName: string;
            plateNumber: string;
            vehicleMake: string | null;
            vehicleModel: string | null;
            vehicleColor: string | null;
            rating: number;
          };
        };
      }>(`/payments/${id}`),
    simulateSuccess: (id: string) =>
      request<{
        success: boolean;
        transaction: {
          id: string;
          status: string;
          amount: number;
          currency: string;
          createdAt: string;
          confirmedAt: string | null;
          taxiId: string;
          driver: {
            displayName: string;
            plateNumber: string;
            vehicleMake: string | null;
            vehicleModel: string | null;
            vehicleColor: string | null;
            rating: number;
          };
        };
      }>(`/payments/${id}/simulate-success`, { method: 'POST' }),
  },
}

