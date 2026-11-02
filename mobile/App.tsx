import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert, Modal
} from 'react-native'
import { mobileApi, setToken, getToken } from './lib/api'
import './lib/i18n'
import { useTranslation } from 'react-i18next'
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera'

const FARE_PRESETS = [
  { id: 'short', label: 'Short Stage (ቅርብ)', amount: 10 },
  { id: 'standard', label: 'Standard (መደበኛ)', amount: 15 },
  { id: 'medium', label: 'Medium (መካከለኛ)', amount: 20 },
  { id: 'long', label: 'Long (ረጅም)', amount: 25 },
  { id: 'express', label: 'Express (ኤክስፕረስ)', amount: 35 },
  { id: 'special', label: 'Night (ልዩ)', amount: 50 },
]


type Screen = 'home' | 'auth' | 'pay' | 'driver-dashboard' | 'driver-register'
type UserRole = 'PASSENGER' | 'DRIVER' | 'ADMIN'
type User = { id: string; phone: string; role: UserRole }

// ---- QR Scanner Modal ----
function QrScannerModal({ onScan, onClose }: { onScan: (taxiId: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    if (!permission?.granted) requestPermission()
  }, [])

  const handleBarcode = (result: BarcodeScanningResult) => {
    if (scanned) return
    setScanned(true)
    const raw = result.data
    // Parse https://paytaxi.et/t/{taxiId} — extract the taxiId segment
    const match = raw.match(/\/t\/([^/?#]+)/)
    if (match) {
      onScan(match[1])
      onClose()
    } else {
      Alert.alert('Invalid QR', 'This QR code is not a PayTaxi code.', [
        { text: 'Try Again', onPress: () => setScanned(false) }
      ])
    }
  }

  if (!permission) return null
  if (!permission.granted) {
    return (
      <Modal transparent animationType="slide">
        <View style={styles.scannerOverlay}>
          <Text style={styles.scannerText}>Camera permission required</Text>
          <TouchableOpacity style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={onClose}>
            <Text>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    )
  }

  return (
    <Modal animationType="slide">
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcode}
        />
        <View style={styles.scannerHUD}>
          <Text style={styles.scannerText}>Point at a PayTaxi QR code</Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={onClose}>
            <Text>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ---- OTP Auth Screen ----
function AuthScreen({ role, onSuccess, onBack }: { role: UserRole; onSuccess: (u: User) => void; onBack: () => void }) {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const requestOtp = async () => {
    setLoading(true); setError('')
    try {
      const data = await mobileApi.auth.requestOtp(phone, role)
      setChallengeId(data.challengeId)
      setDevCode(data.code)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  const verifyOtp = async () => {
    if (!challengeId) return
    setLoading(true); setError('')
    try {
      const data = await mobileApi.auth.verifyOtp(challengeId, code)
      await setToken(data.token)
      onSuccess(data.user as User)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>{t('auth.back')}</Text></TouchableOpacity>
        <Text style={styles.h1}>{role === 'DRIVER' ? t('auth.title_driver') : t('auth.title_passenger')}</Text>
        <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
        {!challengeId ? (
          <>
            <Text style={styles.label}>{t('auth.phone_label')}</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder={t('auth.phone_placeholder')} keyboardType="phone-pad" />
            <TouchableOpacity style={styles.btn} onPress={requestOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('auth.send_otp')}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {devCode && <View style={styles.devBox}><Text style={styles.devText}>{t('auth.dev_otp')} {devCode}</Text></View>}
            <Text style={styles.label}>{t('auth.otp_label')}</Text>
            <TextInput style={[styles.input, styles.mono]} value={code} onChangeText={setCode} keyboardType="numeric" maxLength={6} />
            <TouchableOpacity style={styles.btn} onPress={verifyOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('auth.verify')}</Text>}
            </TouchableOpacity>
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

// ---- Weyala Anti-Fraud Receipt Modal (Mobile) ----
function MobileWeyalaReceiptModal({
  receipt,
  onClose,
}: {
  receipt: any
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [secondsAgo, setSecondsAgo] = useState(0)

  useEffect(() => {
    const start = receipt.confirmedAt ? new Date(receipt.confirmedAt).getTime() : Date.now()
    const timer = setInterval(() => {
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [receipt.confirmedAt])

  const shortCode = `PT-${String(receipt.id || '').slice(0, 8).toUpperCase()}`

  return (
    <Modal animationType="slide" visible={true}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: '#f0fdf4' }]}>
        <ScrollView contentContainerStyle={[styles.container, { alignItems: 'center' }]}>
          {/* Green verification badge */}
          <View style={styles.receiptBadgeCircle}>
            <Text style={{ fontSize: 36, color: '#fff' }}>✓</Text>
          </View>

          <View style={styles.verifiedTag}>
            <Text style={styles.verifiedTagText}>● {t('receipt.verified_banner') || 'PAYMENT VERIFIED'}</Text>
          </View>

          <Text style={styles.receiptWeyalaHint}>
            {t('receipt.weyala_instruction') || 'Show this dynamic screen to the Weyala'}
          </Text>

          {/* Live pulsing timer */}
          <View style={styles.receiptTimerBox}>
            <Text style={styles.receiptTimerText}>
              ⏱ Paid {secondsAgo}s ago · Active ride
            </Text>
          </View>

          {/* Amount Box */}
          <View style={styles.receiptAmountCard}>
            <Text style={styles.receiptAmountLabel}>AMOUNT PAID</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
              <Text style={styles.receiptAmountNum}>{receipt.amount}</Text>
              <Text style={styles.receiptAmountCurrency}> ETB</Text>
            </View>
            <Text style={styles.receiptSeatsLabel}>
              {receipt.label || 'Minibus'} · {receipt.seats || 1} Seat(s)
            </Text>
          </View>

          {/* Taxi Details Card */}
          <View style={styles.receiptDetailsCard}>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabelText}>Plate Number</Text>
              <View style={styles.plateBadge}>
                <Text style={styles.plateBadgeText}>
                  🚕 {receipt.driver?.plateNumber || receipt.taxiId}
                </Text>
              </View>
            </View>

            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabelText}>Taxi ID</Text>
              <Text style={[styles.mono, { fontWeight: '700', color: PRIMARY }]}>{receipt.taxiId}</Text>
            </View>

            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabelText}>Driver</Text>
              <Text style={{ fontWeight: '600', color: '#111' }}>{receipt.driver?.displayName || 'Driver'}</Text>
            </View>

            <View style={[styles.receiptRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.receiptLabelText}>Security Hash</Text>
              <Text style={[styles.mono, { fontSize: 11, color: '#666' }]}>{shortCode}</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.btn, { width: '100%', marginTop: 24 }]} onPress={onClose}>
            <Text style={styles.btnText}>Done / New Payment</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

// ---- Passenger Pay Screen (with QR scanner & Weyala Receipt) ----
function PayScreen({ user, onBack }: { user: User | null; onBack: () => void }) {
  const { t } = useTranslation()
  const [taxiId, setTaxiId] = useState('TX-1001')
  const [fareId, setFareId] = useState('medium')
  const [seats, setSeats] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [receiptData, setReceiptData] = useState<any>(null)

  const selectedPreset = FARE_PRESETS.find(f => f.id === fareId) || FARE_PRESETS[1]
  const totalAmount = selectedPreset.amount * seats

  const handlePay = async (simulate: boolean = false) => {
    setLoading(true)
    setError('')
    try {
      const init = await mobileApi.payments.initiate(taxiId, fareId, seats)
      if (simulate) {
        await mobileApi.payments.simulateSuccess(init.transactionId)
      }
      const statusRes = await mobileApi.payments.receipt(init.transactionId)
      setReceiptData(statusRes.receipt)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>{t('auth.back')}</Text></TouchableOpacity>
        <Text style={styles.h1}>{t('payment.title')}</Text>
        <Text style={styles.subtitle}>Instant contactless payment for Ethiopian minibus taxis.</Text>

        <Text style={styles.label}>{t('payment.taxi_id_label')}</Text>
        <View style={styles.rowBetween}>
          <TextInput
            style={[styles.input, styles.mono, { flex: 1, marginRight: 8, marginBottom: 0 }]}
            value={taxiId}
            onChangeText={setTaxiId}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[styles.btn, { marginBottom: 0, paddingHorizontal: 16 }]}
            onPress={() => setScannerOpen(true)}
          >
            <Text style={styles.btnText}>📷 Scan QR</Text>
          </TouchableOpacity>
        </View>

        {/* Seat count selector */}
        <Text style={[styles.label, { marginTop: 16 }]}>Passenger Seats ({seats})</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[1, 2, 3, 4].map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.seatBtn, seats === s && styles.seatBtnActive]}
              onPress={() => setSeats(s)}
            >
              <Text style={[styles.seatBtnText, seats === s && styles.seatBtnTextActive]}>
                {s} {s === 1 ? 'Seat' : 'Seats'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Minibus Fares */}
        <Text style={styles.label}>{t('payment.fare_label')}</Text>
        {FARE_PRESETS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[styles.fareBtn, fareId === f.id && styles.fareBtnActive]}
            onPress={() => setFareId(f.id)}
          >
            <Text style={styles.fareLabel}>{f.label}</Text>
            <Text style={styles.fareAmount}>{f.amount * seats} ETB</Text>
          </TouchableOpacity>
        ))}

        {/* Total calculation banner */}
        <View style={styles.totalBanner}>
          <Text style={styles.totalBannerLabel}>Total Fare:</Text>
          <Text style={styles.totalBannerAmount}>{totalAmount} ETB</Text>
        </View>

        <TouchableOpacity style={styles.btn} onPress={() => handlePay(false)} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Pay {totalAmount} ETB</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.simulateBtn}
          onPress={() => handlePay(true)}
          disabled={loading}
        >
          <Text style={styles.simulateBtnText}>⚡ Simulate Success (Test Mode)</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {scannerOpen && (
        <QrScannerModal
          onScan={(id) => setTaxiId(id)}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {receiptData && (
        <MobileWeyalaReceiptModal
          receipt={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}
    </SafeAreaView>
  )
}

// ---- Driver Dashboard Screen ----
function DriverDashboardScreen({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [replacing, setReplacing] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setData(await mobileApi.dashboard.get()) } catch { /* noop */ }
    finally { setLoading(false) }
  }

  React.useEffect(() => { load() }, [])

  const replaceQr = async () => {
    setReplacing(true)
    try { await mobileApi.qr.replace(); await load() } catch (e) { Alert.alert('Error', (e as Error).message) }
    finally { setReplacing(false) }
  }

  if (loading) return <SafeAreaView style={styles.safeArea}><ActivityIndicator style={{ marginTop: 80 }} /></SafeAreaView>

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <Text style={styles.h1}>{t('dashboard.welcome', { name: data?.driver?.displayName })}</Text>
          <TouchableOpacity onPress={onLogout}><Text style={styles.link}>{t('dashboard.log_out')}</Text></TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statNum}>{data?.total ?? 0} ETB</Text><Text style={styles.statLabel}>{t('dashboard.earnings')}</Text></View>
          <View style={styles.statCard}><Text style={styles.statNum}>{data?.count ?? 0}</Text><Text style={styles.statLabel}>{t('dashboard.payments')}</Text></View>
          <View style={styles.statCard}><Text style={[styles.statNum, styles.mono]}>{data?.qr?.taxiId ?? '—'}</Text><Text style={styles.statLabel}>{data?.qr?.status ?? t('dashboard.no_qr')}</Text></View>
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={styles.outlineBtn} onPress={replaceQr} disabled={replacing}>
            <Text>{replacing ? t('dashboard.replacing') : t('dashboard.report_lost')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={load}><Text style={styles.btnText}>{t('dashboard.refresh')}</Text></TouchableOpacity>
        </View>
        <Text style={[styles.label, { marginTop: 20 }]}>{t('dashboard.recent_tx')}</Text>
        {data?.transactions?.length ? data.transactions.map((tx: any) => (
          <View key={tx.id} style={styles.txRow}>
            <Text style={styles.mono}>{tx.id.slice(0, 10)}…</Text>
            <Text>{tx.amount} ETB</Text>
            <Text style={styles.badge}>{tx.status}</Text>
          </View>
        )) : <Text style={styles.muted}>{t('dashboard.no_tx')}</Text>}
      </ScrollView>
    </SafeAreaView>
  )
}

// ---- Home Screen ----
function HomeScreen({ setScreen, setRole }: { setScreen: (s: Screen) => void; setRole: (r: UserRole) => void }) {
  const { t, i18n } = useTranslation()
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.brand}>PAYTAXI</Text>
        <Text style={styles.h1}>{t('home.title')}</Text>
        <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => { setRole('PASSENGER'); setScreen('pay') }}>
          <Text style={styles.btnText}>{t('home.pay_btn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={() => { setRole('DRIVER'); setScreen('auth') }}>
          <Text>{t('home.driver_btn')}</Text>
        </TouchableOpacity>
        {/* Language switcher */}
        <View style={[styles.row, { marginTop: 24 }]}>
          <TouchableOpacity onPress={() => i18n.changeLanguage('en')} style={[styles.langBtn, i18n.language === 'en' && styles.langBtnActive]}>
            <Text style={styles.langText}>EN</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => i18n.changeLanguage('am')} style={[styles.langBtn, i18n.language === 'am' && styles.langBtnActive]}>
            <Text style={styles.langText}>አማ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}

// ---- Root ----
export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [role, setRole] = useState<UserRole>('PASSENGER')
  const [user, setUser] = useState<User | null>(null)

  const onAuth = (u: User) => {
    setUser(u)
    setScreen(u.role === 'DRIVER' ? 'driver-dashboard' : 'pay')
  }

  const logout = async () => { await setToken(null); setUser(null); setScreen('home') }

  if (screen === 'auth') return <AuthScreen role={role} onSuccess={onAuth} onBack={() => setScreen('home')} />
  if (screen === 'pay') return <PayScreen user={user} onBack={() => setScreen('home')} />
  if (screen === 'driver-dashboard') return <DriverDashboardScreen onLogout={logout} />
  return <HomeScreen setScreen={setScreen} setRole={setRole} />
}

const PRIMARY = '#1a6b3c'
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f8f5' },
  container: { padding: 20 },
  brand: { fontFamily: 'monospace', fontWeight: '900', color: PRIMARY, fontSize: 14, letterSpacing: 4, marginBottom: 12 },
  h1: { fontSize: 30, fontWeight: '800', color: '#111', marginBottom: 8, lineHeight: 36 },
  subtitle: { color: '#666', marginBottom: 24, fontSize: 15 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#fff', marginBottom: 16 },
  mono: { fontFamily: 'monospace', letterSpacing: 2 },
  btn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 12 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  outlineBtn: { borderWidth: 1, borderColor: '#ccc', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12, flex: 1 },
  fareBtn: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' },
  fareBtnActive: { borderColor: PRIMARY, backgroundColor: '#e8f5ed' },
  fareLabel: { fontWeight: '600' },
  fareAmount: { color: '#555' },
  seatBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  seatBtnActive: { backgroundColor: '#e8f5ed', borderColor: PRIMARY },
  seatBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },
  seatBtnTextActive: { color: PRIMARY, fontWeight: '800' },
  totalBanner: { backgroundColor: '#e8f5ed', borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 14, borderWidth: 1, borderColor: 'rgba(26,107,60,0.2)' },
  totalBannerLabel: { fontWeight: '700', color: '#1a6b3c', fontSize: 14 },
  totalBannerAmount: { fontWeight: '900', color: '#1a6b3c', fontSize: 22 },
  simulateBtn: { borderWidth: 1, borderColor: 'rgba(26,107,60,0.4)', backgroundColor: 'rgba(26,107,60,0.08)', borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  simulateBtnText: { color: '#1a6b3c', fontWeight: '700', fontSize: 13 },
  receiptBadgeCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', shadowColor: '#10b981', shadowOpacity: 0.4, shadowRadius: 10, elevation: 6, marginTop: 10 },
  verifiedTag: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginTop: 16 },
  verifiedTagText: { color: '#15803d', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  receiptWeyalaHint: { fontSize: 13, fontWeight: '600', color: '#166534', marginTop: 8, textAlign: 'center' },
  receiptTimerBox: { backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, marginTop: 12 },
  receiptTimerText: { fontFamily: 'monospace', fontSize: 12, fontWeight: '600', color: '#333' },
  receiptAmountCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: '#e2e8f0', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  receiptAmountLabel: { fontSize: 11, fontWeight: '800', color: '#888', letterSpacing: 1 },
  receiptAmountNum: { fontSize: 42, fontWeight: '900', color: '#111' },
  receiptAmountCurrency: { fontSize: 18, fontWeight: '800', color: PRIMARY },
  receiptSeatsLabel: { fontSize: 12, color: '#666', marginTop: 4 },
  receiptDetailsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', marginTop: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  receiptLabelText: { fontSize: 12, color: '#666', fontWeight: '500' },
  plateBadge: { backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  plateBadgeText: { fontFamily: 'monospace', fontWeight: '900', fontSize: 13, color: '#111' },
  error: { color: '#c0392b', marginTop: 8, fontSize: 14 },
  devBox: { backgroundColor: '#e8f5ed', borderRadius: 10, padding: 12, marginBottom: 12 },
  devText: { fontFamily: 'monospace', color: '#1a6b3c' },
  successBox: { backgroundColor: '#e8f5ed', borderRadius: 10, padding: 12, marginTop: 10 },
  successText: { color: '#1a6b3c', fontWeight: '600' },
  back: { color: '#666', marginBottom: 20, fontWeight: '600' },
  link: { color: PRIMARY, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#eee' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  badge: { fontWeight: '700', color: PRIMARY, fontSize: 12 },
  muted: { color: '#999', fontStyle: 'italic' },
  scannerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 24 },
  scannerHUD: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 20, alignItems: 'center' },
  scannerText: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  langBtn: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  langBtnActive: { borderColor: PRIMARY, backgroundColor: '#e8f5ed' },
  langText: { fontWeight: '700', color: '#333' },
})
