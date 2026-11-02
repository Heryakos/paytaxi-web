import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = {
  auth: {
    title_passenger: 'Passenger Access',
    title_driver: 'Driver Access',
    subtitle: 'Sign in with your phone number',
    phone_label: 'Phone number',
    phone_placeholder: '+251911234567',
    send_otp: 'Send OTP',
    sending: 'Sending…',
    otp_label: '6-digit code',
    verify: 'Verify & Continue',
    verifying: 'Verifying…',
    dev_otp: 'Dev OTP:',
    back: '← Back',
  },
  payment: {
    title: 'Pay a Verified Taxi',
    taxi_id_label: 'Taxi ID',
    fare_label: 'Select fare',
    continue_btn: 'Continue to AddisPay',
    pending_btn: 'Processing…',
  },
  dashboard: {
    welcome: 'Welcome, {{name}}',
    earnings: 'Earnings',
    payments: 'Payments',
    no_qr: 'No QR',
    report_lost: 'Report Lost QR',
    replacing: 'Replacing…',
    refresh: 'Refresh',
    recent_tx: 'Recent Transactions',
    no_tx: 'No transactions yet.',
    log_out: 'Log out',
  },
  home: {
    title: 'Pay your taxi fare\nwith confidence.',
    subtitle: 'Verified drivers. Secure payments via AddisPay.',
    pay_btn: 'Pay a Taxi',
    driver_btn: 'Driver Portal',
  },
};

const am = {
  auth: {
    title_passenger: 'የተሳፋሪ መዳረሻ',
    title_driver: 'የሹፌር መዳረሻ',
    subtitle: 'በስልክ ቁጥርዎ ይግቡ',
    phone_label: 'ስልክ ቁጥር',
    phone_placeholder: '+251911234567',
    send_otp: 'OTP ላክ',
    sending: 'እየተላከ…',
    otp_label: '6-ሃሳቤ ኮድ',
    verify: 'አረጋግጥ እና ቀጥል',
    verifying: 'እያረጋገጠ…',
    dev_otp: 'Dev OTP:',
    back: '← ተመለስ',
  },
  payment: {
    title: 'ተሽከርካሪ ክፍያ ፈፀም',
    taxi_id_label: 'የታክሲ መለያ',
    fare_label: 'ዋጋ ይምረጡ',
    continue_btn: 'ወደ AddisPay ቀጥል',
    pending_btn: 'እየሰራ…',
  },
  dashboard: {
    welcome: 'እንኳን ደህና መጡ፣ {{name}}',
    earnings: 'ደሞዝ',
    payments: 'ክፍያዎች',
    no_qr: 'QR የለም',
    report_lost: 'ጠፋ QR ሪፖርት',
    replacing: 'እየተካ…',
    refresh: 'አድስ',
    recent_tx: 'የቅርብ ግብይቶች',
    no_tx: 'ምንም ግብይቶች የሉም።',
    log_out: 'ወጣ',
  },
  home: {
    title: 'ያለ ሰቆቃ ታክሲ\nክፍያዎን ይፈፅሙ።',
    subtitle: 'የተረጋገጡ ሹፌሮች። ደህንነቱ የተጠበቀ ክፍያ በ AddisPay።',
    pay_btn: 'ታክሲ ክፈል',
    driver_btn: 'የሹፌር ፖርታል',
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      am: { translation: am },
    },
    lng: 'en', // default language; switch by calling i18n.changeLanguage('am')
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
