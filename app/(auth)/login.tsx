import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView, Dimensions, Modal, Image,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase'
import { secureStorage } from '@/lib/secureStorage'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, setCachedTenant, getCachedTenant } from '@/lib/api'
import * as Notifications from 'expo-notifications'
import { queryKeys } from '@/lib/queryKeys'
import { EXPO_PROJECT_ID } from '@/lib/constants'

const { width: SCREEN_W } = Dimensions.get('window')

type Mode = 'landing' | 'login' | 'register' | 'forgot' | 'staff' | 'verify_email'
type LegalDoc = 'gizlilik' | 'kullanim' | 'kvkk' | null
type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

const LEGAL_KEYS: Record<NonNullable<LegalDoc>, { titleKey: string; contentKey: string }> = {
  gizlilik: { titleKey: 'legal_gizlilik_title', contentKey: 'legal_gizlilik_content' },
  kullanim:  { titleKey: 'legal_kullanim_title', contentKey: 'legal_kullanim_content' },
  kvkk:      { titleKey: 'legal_kvkk_title',     contentKey: 'legal_kvkk_content'     },
}

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://app.hemensalon.com'

const SECTORS: { key: string; icon: IoniconsName }[] = [
  { key: 'HAIR',      icon: 'cut-outline' },
  { key: 'BARBER',    icon: 'man-outline' },
  { key: 'NAIL',      icon: 'color-palette-outline' },
  { key: 'SPA',       icon: 'leaf-outline' },
  { key: 'AESTHETIC', icon: 'sparkles-outline' },
  { key: 'MAKEUP',    icon: 'brush-outline' },
  { key: 'TATTOO',    icon: 'pencil-outline' },
  { key: 'PHYSIO',    icon: 'fitness-outline' },
  { key: 'DENTAL',    icon: 'medkit-outline' },
  { key: 'VET',       icon: 'paw-outline' },
  { key: 'OTHER',     icon: 'ellipsis-horizontal-outline' },
]

const FEATURES: { icon: IoniconsName; color: string; bg: string; titleKey: string; descKey: string }[] = [
  { icon: 'calendar-outline',      color: '#7C3AED', bg: '#F5F3FF', titleKey: 'login_feature_appointments_title', descKey: 'login_feature_appointments_desc' },
  { icon: 'people-outline',        color: '#2563EB', bg: '#EFF6FF', titleKey: 'login_feature_crm_title',          descKey: 'login_feature_crm_desc' },
  { icon: 'trending-up-outline',   color: '#059669', bg: '#ECFDF5', titleKey: 'login_feature_finance_title',      descKey: 'login_feature_finance_desc' },
  { icon: 'people-circle-outline', color: '#D97706', bg: '#FFFBEB', titleKey: 'login_feature_staff_title',        descKey: 'login_feature_staff_desc' },
  { icon: 'cube-outline',          color: '#DC2626', bg: '#FEF2F2', titleKey: 'login_feature_stock_title',        descKey: 'login_feature_stock_desc' },
  { icon: 'gift-outline',          color: '#0891B2', bg: '#ECFEFF', titleKey: 'login_feature_packages_title',     descKey: 'login_feature_packages_desc' },
]

export default function Login() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const headerPad = useHeaderPad()
  const [mode, setMode] = useState<Mode>('landing')
  const [activeCard, setActiveCard] = useState(0)
  const [legalDoc, setLegalDoc] = useState<LegalDoc>(null)
  const cardScrollRef = useRef<ScrollView>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [businessCity, setBusinessCity] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessSector, setBusinessSector] = useState('HAIR')
  const [showSectorPicker, setShowSectorPicker] = useState(false)
  const [ownerName, setOwnerName] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  // Beni hatırla
  const [rememberMe, setRememberMe] = useState(false)
  const [rememberStaff, setRememberStaff] = useState(false)

  // Personel girişi
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [showStaffPass, setShowStaffPass] = useState(false)

  // Kayıtlı bilgileri yükle (sadece email, şifre saklanmaz)
  useEffect(() => {
    secureStorage.getItem('remember_owner_email').then(v => {
      if (v) { setEmail(v); setRememberMe(true) }
    })
    secureStorage.getItem('remember_staff_email').then(v => {
      if (v) { setStaffEmail(v); setRememberStaff(true) }
    })
  }, [])

  async function handleSubmit() {
    if (mode === 'forgot') {
      if (!email) { Alert.alert(t('warning'), t('auth_fillAll')); return }
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      setLoading(false)
      if (error) Alert.alert(t('error'), error.message)
      else Alert.alert(t('success'), t('auth_reset_sent'), [
        { text: t('ok'), onPress: () => setMode('login') },
      ])
      return
    }

    if (!email || !password) { Alert.alert(t('warning'), t('auth_fillAll')); return }
    if (mode === 'register') {
      if (!businessName.trim()) { Alert.alert(t('warning'), t('auth_fillAll')); return }
      if (!businessPhone.trim()) { Alert.alert(t('warning'), t('auth_fillAll')); return }
      if (!agreed) { Alert.alert(t('warning'), t('auth_terms_required')); return }
    }

    setLoading(true)

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        await supabase.auth.signOut().catch(() => {})
        setLoading(false)
        Alert.alert(t('auth_loginError'), t('auth_invalidCredentials'))
        return
      }

      // E-posta doğrulaması kontrolü (Supabase bazen confirmed ama alan boş dönüyor — confirmed_at veya identities ile kontrol et)
      const isConfirmed = !!data.user?.email_confirmed_at || !!data.user?.confirmed_at
      if (!isConfirmed) {
        await supabase.auth.signOut()
        setLoading(false)
        setMode('verify_email')
        return
      }

      const accessToken = data.session?.access_token

      // Tenant bilgisini al — staff hesabı ise engelle
      // mobile_token'ı HENÜZ secureStorage'a kaydetmiyoruz; routing effect tetiklenmesin
      if (accessToken) {
        const expiresAt = data.session?.expires_at
        // Direkt fetch ile staff kontrolü yap (secureStorage'a kaydetmeden)
        try {
          const checkRes = await fetch(`${BASE}/api/me`, {
            headers: {
              'Content-Type': 'application/json',
              'x-mobile-token': accessToken,
              'Authorization': `Bearer ${accessToken}`,
            },
          })
          const checkData = await checkRes.json().catch(() => ({}))
          if (!checkRes.ok) {
            if (checkData?.error === 'STAFF_ACCOUNT') {
              await supabase.auth.signOut()
              setLoading(false)
              Alert.alert(t('auth_staff_title'), t('auth_staff_msg'), [{ text: t('ok') }])
              return
            }
            // Diğer hatalarda devam et
          } else {
            setCachedTenant(checkData)
          }
        } catch { /* ağ hatası — devam et */ }

        // Kontrol geçti, şimdi kaydet
        await secureStorage.setItem('mobile_token', accessToken)
        await secureStorage.setItem('login_time', Date.now().toString())
        if (expiresAt) {
          await secureStorage.setItem('session_expires_at', (expiresAt * 1000).toString())
        }
      }

      // Beni hatırla — işletme (sadece email, şifre saklanmaz)
      if (rememberMe) {
        await secureStorage.setItem('remember_owner_email', email)
      } else {
        await secureStorage.removeItem('remember_owner_email')
      }

      try {
        const tenant = getCachedTenant() ?? await api.tenant.get()
        setCachedTenant(tenant)
        AsyncStorage.setItem('cached_tenant_id', tenant.id).catch(() => {})
        const tid = tenant.id
        const today = new Date()
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
        await Promise.all([
          queryClient.prefetchQuery({ queryKey: queryKeys.dashboard(tid), queryFn: () => api.dashboard.full(todayStr), staleTime: 20 * 1000 }),
          queryClient.prefetchQuery({ queryKey: queryKeys.appointments(tid, todayStr), queryFn: () => api.appointments.list({ date: todayStr }), staleTime: 20 * 1000 }),
        ])
      } catch {
        // Prefetch hatası — devam et
      }
      setLoading(false)
      router.replace('/(tabs)')
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setLoading(false); Alert.alert(t('auth_registerError'), error.message); return }
      const supabaseId = data.user?.id
      if (supabaseId) {
        try {
          const res = await fetch(`${BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              supabaseId, email,
              name: ownerName.trim() || email.split('@')[0],
              businessName: businessName.trim(),
              phone: businessPhone.trim() || undefined,
              address: businessAddress.trim()
                ? `${businessAddress.trim()}${businessCity.trim() ? ', ' + businessCity.trim() : ''}`
                : businessCity.trim() || undefined,
              sector: businessSector,
              plan: 'BASLANGIC',
            }),
          })
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            throw new Error(d?.error ?? t('auth_register_failed'))
          }
        } catch (e: unknown) {
          await supabase.auth.signOut()
          setLoading(false)
          Alert.alert(t('auth_registerError'), e instanceof Error ? e.message : t('err_createFailed'))
          return
        }
      }
      setLoading(false)
      setMode('verify_email')
    }
  }

  async function handleResendVerification() {
    if (resendCooldown > 0) return
    setLoading(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setLoading(false)
    if (error) {
      Alert.alert(t('error'), error.message)
    } else {
      Alert.alert(t('success'), t('auth_verify_resend_success'))
      setResendCooldown(60)
      const interval = setInterval(() => {
        setResendCooldown(v => {
          if (v <= 1) { clearInterval(interval); return 0 }
          return v - 1
        })
      }, 1000)
    }
  }

  async function handleStaffLogin() {
    if (!staffEmail.trim() || !staffPassword.trim()) {
      Alert.alert(t('warning'), t('auth_fillAll'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/api/auth/staff-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: staffEmail.trim(), password: staffPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        Alert.alert(t('auth_loginError'), data?.error ?? t('auth_invalidStaff'))
        setLoading(false)
        return
      }
      // Store real Supabase JWT as mobile_token (staff routes use x-mobile-token)
      await secureStorage.setItem('mobile_token', data.access_token)
      if (data.refresh_token) {
        await secureStorage.setItem('refresh_token', data.refresh_token)
      }
      // staff_token = marker: layout staff tespiti için kullanılıyor
      await secureStorage.setItem('staff_token', 'staff')
      await secureStorage.setItem('login_time', Date.now().toString())
      await secureStorage.setItem('staff_data', JSON.stringify({
        name: data.name,
        role: 'staff',
        staffId: data.staffId,
      }))
      // Beni hatırla — personel (sadece email, şifre saklanmaz)
      if (rememberStaff) {
        await secureStorage.setItem('remember_staff_email', staffEmail.trim())
      } else {
        await secureStorage.removeItem('remember_staff_email')
      }
      // Push token'ı giriş sonrası kaydet
      try {
        const { status } = await Notifications.requestPermissionsAsync()
        if (status === 'granted') {
          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: EXPO_PROJECT_ID,
          })
          await api.pushToken.registerStaff(tokenData.data)
        }
      } catch {}
      router.replace('/(staff)')
    } catch {
      Alert.alert(t('error'), t('err_general'))
    }
    setLoading(false)
  }

  // ── LEGAL MODAL ─────────────────────────────────────────
  const legalModal = (
    <Modal visible={legalDoc !== null} animationType="slide" presentationStyle="pageSheet">
      <View style={ls.root}>
        <View style={ls.header}>
          <Text style={ls.title}>{legalDoc ? t(LEGAL_KEYS[legalDoc].titleKey) : ''}</Text>
          <TouchableOpacity style={ls.closeBtn} onPress={() => setLegalDoc(null)}>
            <Ionicons name="close" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
        <ScrollView style={ls.body} showsVerticalScrollIndicator={false}>
          <Text style={ls.content}>{legalDoc ? t(LEGAL_KEYS[legalDoc].contentKey) : ''}</Text>
          <View style={{ height: 60 }} />
        </ScrollView>
        <TouchableOpacity style={ls.doneBtn} onPress={() => setLegalDoc(null)}>
          <Text style={ls.doneTxt}>{t('ok')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )

  // ── EMAIL VERIFY ────────────────────────────────────────
  if (mode === 'verify_email') {
    return (
      <View style={s.root}>
        <View style={s.deco1} />
        <View style={s.deco2} />
        <View style={s.deco3} />
        <View style={[s.formScroll, { flex: 1, justifyContent: 'center', paddingTop: headerPad }]}>
          <View style={s.card}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <Ionicons name="mail-outline" size={36} color="#7C3AED" />
              </View>
              <Text style={[s.cardTitle, { textAlign: 'center' }]}>{t('auth_verify_title')}</Text>
              <Text style={[s.cardSub, { textAlign: 'center', marginTop: 8 }]}>
                {t('auth_verify_sub', { email })}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginTop: 12, borderWidth: 1, borderColor: '#FDE68A' }}>
                <Ionicons name="warning-outline" size={14} color="#D97706" />
                <Text style={{ fontSize: 12, color: '#92400E', flex: 1 }}>{t('auth_verify_check_spam')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[s.btn, resendCooldown > 0 && { backgroundColor: '#9CA3AF' }]}
              onPress={handleResendVerification}
              disabled={loading || resendCooldown > 0}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnTxt}>
                    {resendCooldown > 0
                      ? t('auth_verify_resend_wait', { sec: resendCooldown })
                      : t('auth_verify_resend_btn')}
                  </Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.switchRow, { marginTop: 16 }]}
              onPress={() => { setMode('login'); setPassword('') }}
            >
              <Ionicons name="chevron-back" size={14} color="#7C3AED" />
              <Text style={s.switchLink}>{t('auth_verify_back')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  // ── LANDING ─────────────────────────────────────────────
  if (mode === 'landing') {
    return (
      <View style={s.root}>
        {legalModal}
        <View style={s.deco1} />
        <View style={s.deco2} />
        <View style={s.deco3} />

        {/* Logo */}
        <View style={[s.hero, { paddingTop: headerPad }]}>
          <Image source={require('@/assets/icon.png')} style={s.heroIcon} />
          <Text style={s.heroTitle}>HemenSalon</Text>
        </View>

        {/* Kartlar — ekranı doldurur */}
        <ScrollView
          ref={cardScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={SCREEN_W - 32}
          snapToAlignment="start"
          contentContainerStyle={s.carouselContent}
          onMomentumScrollEnd={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - 32))
            setActiveCard(idx)
          }}
          style={s.carousel}
        >
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureCard}>
              <View style={[s.featureIconWrap, { backgroundColor: f.bg }]}>
                <Ionicons name={f.icon} size={44} color={f.color} />
              </View>
              <Text style={s.featureTitle}>{t(f.titleKey)}</Text>
              <Text style={s.featureDesc}>{t(f.descKey)}</Text>
              <View style={[s.featureAccent, { backgroundColor: f.color }]} />
            </View>
          ))}
        </ScrollView>

        {/* Nokta indikatörü */}
        <View style={s.dotRow}>
          {FEATURES.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                cardScrollRef.current?.scrollTo({ x: i * (SCREEN_W - 32), animated: true })
                setActiveCard(i)
              }}
            >
              <View style={[s.dot, activeCard === i && s.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Alt alan — sabit */}
        <View style={s.landingBottom}>
          <View style={s.trialBadge}>
            <Ionicons name="gift-outline" size={14} color="#F59E0B" />
            <Text style={s.trialTxt}>3 {t('days_free')} · {t('login_no_card')}</Text>
          </View>

          <TouchableOpacity
            style={s.ctaPrimary}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMode('register') }}
            activeOpacity={0.88}
          >
            <Ionicons name="rocket-outline" size={20} color="#7C3AED" />
            <Text style={s.ctaPrimaryTxt}>{t('auth_register')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.ctaSecondary}
            onPress={() => { Haptics.selectionAsync(); setMode('login') }}
            activeOpacity={0.88}
          >
            <Text style={s.ctaSecondaryTxt}>{t('auth_hasAccount')}</Text>
            <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.ctaStaff}
            onPress={() => { Haptics.selectionAsync(); setMode('staff') }}
            activeOpacity={0.88}
          >
            <Ionicons name="person-outline" size={16} color="rgba(255,255,255,0.65)" />
            <Text style={s.ctaStaffTxt}>{t('auth_staffLogin')}</Text>
          </TouchableOpacity>

          <View style={s.legalRow}>
            <TouchableOpacity onPress={() => setLegalDoc('gizlilik')}>
              <Text style={s.legalLink}>{t('auth_footer_privacy')}</Text>
            </TouchableOpacity>
            <Text style={s.legalDot}>·</Text>
            <TouchableOpacity onPress={() => setLegalDoc('kullanim')}>
              <Text style={s.legalLink}>{t('auth_footer_terms')}</Text>
            </TouchableOpacity>
            <Text style={s.legalDot}>·</Text>
            <TouchableOpacity onPress={() => setLegalDoc('kvkk')}>
              <Text style={s.legalLink}>{t('auth_footer_kvkk')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  // ── AUTH FORM ────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {legalModal}
      <View style={s.deco1} />
      <View style={s.deco2} />
      <View style={s.deco3} />

      <ScrollView
        contentContainerStyle={[s.formScroll, { paddingTop: headerPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Geri */}
        <TouchableOpacity style={s.backBtn} onPress={() => { setMode('landing'); setEmail(''); setPassword(''); setBusinessName(''); setStaffEmail(''); setStaffPassword('') }}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
          <Text style={s.backBtnTxt}>{t('back')}</Text>
        </TouchableOpacity>

        {/* Logo */}
        <View style={s.formLogoWrap}>
          <Image source={require('@/assets/icon.png')} style={s.logoIcon} />
          <Text style={s.logoText}>HemenSalon</Text>
        </View>

        {/* Form kartı */}
        <View style={s.card}>
          {mode === 'staff' ? (
            <>
              <View style={s.staffBadge}>
                <Ionicons name="people-outline" size={18} color="#7C3AED" />
                <Text style={s.staffBadgeTxt}>{t('auth_staffLogin')}</Text>
              </View>
              <Text style={s.cardTitle}>{t('auth_staffLoginBtn')}</Text>
              <Text style={s.cardSub}>{t('auth_staffLoginDesc')}</Text>

              <InputField
                icon="mail-outline"
                placeholder={t('auth_emailPlaceholder')}
                value={staffEmail}
                onChange={setStaffEmail}
                keyboardType="email-address"
              />
              <InputField
                icon="lock-closed-outline"
                placeholder={t('auth_passwordPlaceholder')}
                value={staffPassword}
                onChange={setStaffPassword}
                secureEntry={!showStaffPass}
                right={
                  <TouchableOpacity onPress={() => setShowStaffPass(v => !v)} style={s.eyeBtn}>
                    <Ionicons name={showStaffPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                }
              />

              <TouchableOpacity style={s.rememberRow} onPress={() => { Haptics.selectionAsync(); setRememberStaff(v => !v) }} activeOpacity={0.7}>
                <View style={[s.checkbox, rememberStaff && s.checkboxChecked]}>
                  {rememberStaff && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
                <Text style={s.rememberTxt}>{t('auth_remember_me')}</Text>
              </TouchableOpacity>

              <SubmitBtn loading={loading} label={t('auth_staffLoginBtn')} onPress={handleStaffLogin} />

              <TouchableOpacity style={s.switchRow} onPress={() => { Haptics.selectionAsync(); setMode('login') }}>
                <Text style={s.switchTxt}>{t('auth_hasAccount')} </Text>
                <Text style={s.switchLink}>{t('auth_login')} →</Text>
              </TouchableOpacity>
            </>
          ) : mode === 'forgot' ? (
            <>
              <TouchableOpacity style={s.inlineBack} onPress={() => setMode('login')}>
                <Ionicons name="chevron-back" size={18} color="#7C3AED" />
                <Text style={s.inlineBackTxt}>{t('back')}</Text>
              </TouchableOpacity>
              <Text style={s.cardTitle}>{t('auth_forgot_title')}</Text>
              <Text style={s.cardSub}>{t('auth_forgot_sub')}</Text>
              <InputField icon="mail-outline" placeholder={t('auth_emailPlaceholder')} value={email} onChange={setEmail} keyboardType="email-address" />
              <SubmitBtn loading={loading} label={t('auth_reset_send_btn')} onPress={handleSubmit} />
            </>
          ) : (
            <>
              {/* Tab */}
              <View style={s.tabRow}>
                <TabBtn label={t('auth_login')} active={mode === 'login'} onPress={() => { Haptics.selectionAsync(); setMode('login') }} />
                <TabBtn label={t('auth_register')} active={mode === 'register'} onPress={() => { Haptics.selectionAsync(); setMode('register') }} />
              </View>

              <Text style={s.cardTitle}>
                {mode === 'login' ? t('auth_welcome') : t('auth_register')}
              </Text>

              {mode === 'register' && (
                <>
                  <Text style={s.sectionLabel}>{t('settings_business')}</Text>

                  {/* Sektör seçici */}
                  <Text style={s.fieldLabel}>{t('settings_sector')}</Text>
                  <TouchableOpacity style={s.sectorBtn} onPress={() => setShowSectorPicker(v => !v)}>
                    <Ionicons name={SECTORS.find(sec => sec.key === businessSector)?.icon ?? 'cut-outline'} size={18} color="#7C3AED" />
                    <Text style={s.sectorBtnTxt}>{t(`sector_${businessSector}`)}</Text>
                    <Ionicons name={showSectorPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                  {showSectorPicker && (
                    <View style={s.sectorDropdown}>
                      {SECTORS.map(sec => (
                        <TouchableOpacity
                          key={sec.key}
                          style={[s.sectorOption, businessSector === sec.key && s.sectorOptionActive]}
                          onPress={() => { Haptics.selectionAsync(); setBusinessSector(sec.key); setShowSectorPicker(false) }}
                        >
                          <Ionicons name={sec.icon} size={16} color={businessSector === sec.key ? '#7C3AED' : '#6B7280'} />
                          <Text style={[s.sectorOptionTxt, businessSector === sec.key && s.sectorOptionTxtActive]}>
                            {t(`sector_${sec.key}`)}
                          </Text>
                          {businessSector === sec.key && <Ionicons name="checkmark" size={15} color="#7C3AED" style={{ marginLeft: 'auto' }} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <InputField icon="storefront-outline" placeholder={`${t('settings_businessName')} *`} value={businessName} onChange={setBusinessName} />
                  <InputField icon="call-outline" placeholder={`${t('phone')} *`} value={businessPhone} onChange={setBusinessPhone} keyboardType="phone-pad" />
                  <InputField icon="location-outline" placeholder={t('auth_city_ph')} value={businessCity} onChange={setBusinessCity} />
                  <InputField icon="map-outline" placeholder={t('address')} value={businessAddress} onChange={setBusinessAddress} />
                  <Text style={s.sectionLabel}>{t('auth_ownerName')}</Text>
                  <InputField icon="person-outline" placeholder={t('auth_namePlaceholder')} value={ownerName} onChange={setOwnerName} />
                </>
              )}

              <InputField icon="mail-outline" placeholder={t('auth_emailPlaceholder')} value={email} onChange={setEmail} keyboardType="email-address" />
              <InputField
                icon="lock-closed-outline" placeholder={t('auth_passwordPlaceholder')} value={password} onChange={setPassword}
                secureEntry={!showPass}
                right={
                  <TouchableOpacity onPress={() => setShowPass(v => !v)} style={s.eyeBtn}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                }
              />

              {mode === 'login' && (
                <View style={s.loginMeta}>
                  <TouchableOpacity style={s.rememberRow} onPress={() => { Haptics.selectionAsync(); setRememberMe(v => !v) }} activeOpacity={0.7}>
                    <View style={[s.checkbox, rememberMe && s.checkboxChecked]}>
                      {rememberMe && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                    <Text style={s.rememberTxt}>{t('auth_remember_me')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setMode('forgot')}>
                    <Text style={s.forgotTxt}>{t('auth_forgot_link')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {mode === 'register' && (
                <>
                  {/* Sözleşme onayı */}
                  <TouchableOpacity
                    style={s.agreeRow}
                    onPress={() => { Haptics.selectionAsync(); setAgreed(v => !v) }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.checkbox, agreed && s.checkboxChecked]}>
                      {agreed && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                    <Text style={s.agreeTxt}>
                      <Text style={s.agreeLink} onPress={() => { Haptics.selectionAsync(); setLegalDoc('kullanim') }}>{t('auth_agree_terms')}</Text>
                      {t('auth_agree_text')}
                      <Text style={s.agreeLink} onPress={() => { Haptics.selectionAsync(); setLegalDoc('gizlilik') }}>{t('auth_agree_privacy')}</Text>
                      {t('auth_agree_text2')}
                    </Text>
                  </TouchableOpacity>

                  {/* KVKK notu */}
                  <View style={s.kvkkBox}>
                    <Ionicons name="shield-checkmark-outline" size={14} color="#059669" />
                    <Text style={s.kvkkTxt}>
                      {t('auth_kvkk_note')}
                      <Text style={s.kvkkLink} onPress={() => { Haptics.selectionAsync(); setLegalDoc('kvkk') }}>{t('auth_kvkk_link')}</Text>
                    </Text>
                  </View>
                </>
              )}

              <SubmitBtn loading={loading} label={mode === 'login' ? t('auth_login') : t('auth_register')} onPress={handleSubmit} />

              {mode === 'login' && (
                <View style={s.switchRow}>
                  <Text style={s.switchTxt}>{t('auth_noAccount')} </Text>
                  <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setMode('register'); setPassword(''); setBusinessName('') }}>
                    <Text style={s.switchLink}>{t('auth_register')} →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* Alt legal linkler */}
        <View style={s.bottomLegal}>
          <TouchableOpacity onPress={() => setLegalDoc('kullanim')}>
            <Text style={s.bottomLegalLink}>{t('auth_footer_terms')}</Text>
          </TouchableOpacity>
          <Text style={s.bottomLegalDot}>·</Text>
          <TouchableOpacity onPress={() => setLegalDoc('gizlilik')}>
            <Text style={s.bottomLegalLink}>{t('auth_footer_privacy')}</Text>
          </TouchableOpacity>
          <Text style={s.bottomLegalDot}>·</Text>
          <TouchableOpacity onPress={() => setLegalDoc('kvkk')}>
            <Text style={s.bottomLegalLink}>{t('auth_footer_kvkk')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.tabBtn, active && s.tabBtnActive]} onPress={onPress}>
      <Text style={[s.tabTxt, active && s.tabTxtActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

function InputField({ icon, placeholder, value, onChange, keyboardType, secureEntry, right }: {
  icon: string; placeholder: string; value: string; onChange: (v: string) => void
  keyboardType?: any; secureEntry?: boolean; right?: React.ReactNode
}) {
  return (
    <View style={s.fieldWrap}>
      <View style={s.fieldIcon}><Ionicons name={icon as any} size={18} color="#7C3AED" /></View>
      <TextInput
        style={[s.field, right ? { paddingRight: 44 } : null]}
        placeholder={placeholder} value={value} onChangeText={onChange}
        autoCapitalize="none" keyboardType={keyboardType ?? 'default'}
        secureTextEntry={secureEntry ?? false} placeholderTextColor="#9CA3AF"
      />
      {right}
    </View>
  )
}

function SubmitBtn({ loading, label, onPress }: { loading: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.btn} onPress={onPress} disabled={loading} activeOpacity={0.85}>
      {loading ? <ActivityIndicator color="#fff" /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.btnTxt}>{label}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#7C3AED' },
  deco1: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: '#5B21B6', opacity: 0.45, top: -90, right: -80 },
  deco2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#fff', opacity: 0.04, top: 140, left: -60 },
  deco3: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: '#5B21B6', opacity: 0.3, bottom: 80, right: -40 },

  // ── Landing ──
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 16 },
  heroIcon: { width: 48, height: 48, borderRadius: 15 },
  heroTitle: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },

  carousel: { flex: 1 },
  carouselContent: { paddingHorizontal: 16, gap: 16, alignItems: 'stretch' },
  featureCard: { width: SCREEN_W - 48, backgroundColor: '#fff', borderRadius: 28, padding: 32, shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 20, elevation: 6, overflow: 'hidden', justifyContent: 'center' },
  featureIconWrap: { width: 88, height: 88, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  featureTitle: { fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 12 },
  featureDesc: { fontSize: 16, color: '#6B7280', lineHeight: 24 },
  featureAccent: { position: 'absolute', bottom: -30, right: -30, width: 150, height: 150, borderRadius: 75, opacity: 0.1 },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { width: 22, backgroundColor: '#fff', borderRadius: 3 },

  landingBottom: { paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 40 : 28, gap: 10 },
  trialBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(245,158,11,0.18)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' },
  trialTxt: { fontSize: 13, fontWeight: '700', color: '#FCD34D' },

  ctaWrap: { gap: 10, marginBottom: 24 },
  ctaPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, elevation: 6 },
  ctaPrimaryTxt: { fontSize: 17, fontWeight: '900', color: '#7C3AED' },
  ctaSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  ctaSecondaryTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  ctaStaff: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  ctaStaffTxt: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },

  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  legalLink: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600', textDecorationLine: 'underline' },
  legalDot: { fontSize: 12, color: 'rgba(255,255,255,0.3)' },
  copyright: { textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)' },

  // ── Auth form ──
  formScroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 20 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20, alignSelf: 'flex-start' },
  backBtnTxt: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },

  formLogoWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 28 },
  logoIcon: { width: 44, height: 44, borderRadius: 14 },
  logoText: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },

  card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 },

  inlineBack: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 18 },
  inlineBackTxt: { fontSize: 14, fontWeight: '600', color: '#7C3AED' },

  cardTitle: { fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#6B7280', marginBottom: 20 },

  tabRow: { flexDirection: 'row', backgroundColor: '#F4F4F8', borderRadius: 14, padding: 4, marginBottom: 22 },
  tabBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 11 },
  tabBtnActive: { backgroundColor: '#7C3AED', shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  tabTxt: { fontSize: 14, fontWeight: '700', color: '#9CA3AF' },
  tabTxtActive: { color: '#fff' },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 },
  sectorBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8 },
  sectorBtnTxt: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '600' },
  sectorDropdown: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  sectorOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  sectorOptionActive: { backgroundColor: '#F5F3FF' },
  sectorOptionTxt: { fontSize: 14, color: '#374151', fontWeight: '500' },
  sectorOptionTxtActive: { color: '#7C3AED', fontWeight: '700' },
  fieldWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12, overflow: 'hidden' },
  fieldIcon: { width: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  field: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 16, paddingRight: 14 },
  eyeBtn: { position: 'absolute', right: 14, padding: 4 },

  loginMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: -2, marginBottom: 14 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rememberTxt: { fontSize: 13, fontWeight: '600', color: '#374151' },
  forgotTxt: { fontSize: 13, fontWeight: '600', color: '#7C3AED' },

  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginTop: 1, flexShrink: 0 },
  checkboxChecked: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  agreeTxt: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 18 },
  agreeLink: { color: '#7C3AED', fontWeight: '700', textDecorationLine: 'underline' },

  kvkkBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#D1FAE5' },
  kvkkTxt: { flex: 1, fontSize: 11, color: '#374151', lineHeight: 16 },
  kvkkLink: { color: '#059669', fontWeight: '700', textDecorationLine: 'underline' },

  btn: { backgroundColor: '#7C3AED', padding: 17, borderRadius: 14, alignItems: 'center', marginTop: 4, shadowColor: '#7C3AED', shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  switchTxt: { fontSize: 13, color: '#6B7280' },
  switchLink: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

  bottomLegal: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' },
  bottomLegalLink: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600', textDecorationLine: 'underline' },
  bottomLegalDot: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },

  // Personel girişi
  staffBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5F3FF', borderRadius: 20, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, marginBottom: 14 },
  staffBadgeTxt: { fontSize: 12, fontWeight: '800', color: '#7C3AED' },
  staffInfoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  staffInfoTxt: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 17 },
})

const ls = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 18, fontWeight: '900', color: '#111827', flex: 1 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  content: { fontSize: 14, color: '#374151', lineHeight: 24 },
  doneBtn: { marginHorizontal: 20, marginBottom: Platform.OS === 'ios' ? 40 : 24, backgroundColor: '#7C3AED', borderRadius: 14, padding: 16, alignItems: 'center' },
  doneTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
