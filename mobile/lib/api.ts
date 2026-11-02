const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.17.113:5000'

import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'paytaxi_token'

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token)
  else await SecureStore.deleteItemAsync(TOKEN_KEY)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

export const mobileApi = {
  auth: {
    requestOtp: (phone: string, role: string) =>
      request<{ challengeId: string; code: string; expiresInSeconds: number }>(
        '/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone, role }) }
      ),
    verifyOtp: (challengeId: string, code: string) =>
      request<{ user: { id: string; phone: string; role: string }; token: string }>(
        '/auth/verify-otp', { method: 'POST', body: JSON.stringify({ challengeId, code }) }
      ),
  },
  drivers: {
    register: (data: object) =>
      request<{ driver: unknown }>('/drivers/register', { method: 'POST', body: JSON.stringify(data) }),
    profile: () => request<{ profile: unknown }>('/drivers/profile'),
    listAll: (status?: string) =>
      request<{ drivers: any[] }>(`/drivers/admin/all${status ? `?status=${status}` : ''}`),
    approve: (id: string) =>
      request<{ profile: any; qr: any }>(`/drivers/${id}/approve`, { method: 'POST' }),
    reject: (id: string, reason?: string) =>
      request<{ profile: any }>(`/drivers/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },
  dashboard: {
    get: () => request<unknown>('/dashboard'),
    streamUrl: (token?: string) => `${API_BASE}/dashboard/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  },
  qr: {
    verify: (taxiId: string) => request<{ taxiId: string; driver: any }>(`/qr/${taxiId}`),
    replace: () => request<{ qr: unknown }>('/qr/replace', { method: 'POST' }),
  },
  payments: {
    initiate: (taxiId: string, farePresetId?: string, seats: number = 1, customAmount?: number) =>
      request<{ transactionId: string; fare: { amount: number; label: string }; checkoutUrl: string }>(
        '/payments/initiate', { method: 'POST', body: JSON.stringify({ taxiId, farePresetId, seats, customAmount }) }
      ),
    simulateSuccess: (transactionId: string) =>
      request<{ status: string; message: string; transaction: any }>(
        `/payments/${transactionId}/simulate-success`, { method: 'POST' }
      ),
    receipt: (transactionId: string) =>
      request<{ receipt: any }>(`/payments/${transactionId}`),
  },
}
