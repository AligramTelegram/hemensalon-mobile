import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { api, TenantProfile } from '@/lib/api'
import { secureStorage } from '@/lib/secureStorage'
import { useTranslation } from 'react-i18next'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

type MenuItem = {
  iconName: IoniconsName
  label: string
  desc: string
  route: string
  color: string
  bg: string
}
const PLAN_COLOR: Record<string, string> = {
  BASLANGIC: '#2563EB', PROFESYONEL: '#7C3AED', ISLETME: '#D97706',
}

export default function Menu() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const [profile, setProfile] = useState<TenantProfile | null>(null)
  const [email, setEmail] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: { user } }] = await Promise.all([supabase.auth.getUser()])
      setEmail(user?.email ?? '')
      try { setProfile(await api.tenant.get()) } catch {}
    }
    load()
  }, [])

  function handleLogout() {
    Alert.alert(t('logout'), t('menu_logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: async () => {
        setLoggingOut(true)
        await secureStorage.removeItem('staff_token')
        await secureStorage.removeItem('staff_data')
        await supabase.auth.signOut()
      }},
    ])
  }

  const CATEGORIES: { title: string; items: MenuItem[] }[] = [
    {
      title: t('menu_management'),
      items: [
        { iconName: 'cut-outline',    label: t('hizmetler_title'),  desc: t('menu_desc_hizmetler'), route: '/hizmetler',  color: '#7C3AED', bg: '#EDE9FE' },
        { iconName: 'people-outline', label: t('staff_title'),      desc: t('menu_desc_calisanlar'), route: '/calisanlar', color: '#2563EB', bg: '#DBEAFE' },
        { iconName: 'cube-outline',   label: t('menu_stok'),        desc: t('menu_desc_stok'),       route: '/stok',       color: '#EA580C', bg: '#FFF7ED' },
        { iconName: 'gift-outline',   label: t('paketler_title'),   desc: t('menu_desc_paketler'),   route: '/paketler',   color: '#7C3AED', bg: '#EDE9FE' },
      ],
    },
    {
      title: t('menu_financeReports'),
      items: [
        { iconName: 'wallet-outline',    label: t('finans_title'),   desc: t('menu_desc_finans'),   route: '/finans',   color: '#059669', bg: '#D1FAE5' },
        { iconName: 'bar-chart-outline', label: t('menu_raporlar'), desc: t('menu_desc_raporlar'), route: '/raporlar', color: '#D97706', bg: '#FEF3C7' },
      ],
    },
    {
      title: t('menu_marketing'),
      items: [
        { iconName: 'megaphone-outline', label: t('menu_kampanya'),  desc: t('menu_desc_kampanya'),  route: '/kampanya',  color: '#2563EB', bg: '#EFF6FF' },
        { iconName: 'pricetag-outline',  label: t('menu_promosyon'), desc: t('menu_desc_promosyon'), route: '/promosyon', color: '#DC2626', bg: '#FEF2F2' },
      ],
    },
    {
      title: t('menu_account'),
      items: [
        { iconName: 'card-outline',     label: t('menu_abonelik'), desc: t('menu_desc_abonelik'), route: '/abonelik', color: '#D97706', bg: '#FEF3C7' },
        { iconName: 'settings-outline', label: t('settings'),      desc: t('menu_desc_ayarlar'),  route: '/ayarlar',  color: '#6B7280', bg: '#F3F4F6' },
      ],
    },
  ]
  const PLAN_LABEL: Record<string, string> = {
    BASLANGIC: t('subscription_plan_BASLANGIC'),
    PROFESYONEL: t('subscription_plan_PROFESYONEL'),
    ISLETME: t('subscription_plan_ISLETME'),
  }
  const planColor = PLAN_COLOR[profile?.plan ?? 'BASLANGIC']
  const planLabel = PLAN_LABEL[profile?.plan ?? 'BASLANGIC'] ?? profile?.plan

  const daysLeft = profile?.planEndsAt
    ? Math.ceil((new Date(profile.planEndsAt).getTime() - Date.now()) / 86400000)
    : null

  const smsTotal = (profile?.smsMonthlyLimit ?? 0) + (profile?.smsCredits ?? 0)
  const smsPct = profile && smsTotal > 0
    ? Math.min(((profile.smsUsed ?? 0) / smsTotal) * 100, 100)
    : 0

  return (
    <ScrollView style={s.root} showsVerticalScrollIndicator={false}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <Text style={s.headerTitle}>{t('nav_menu')}</Text>
        <Text style={s.headerSub}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <View style={s.heroCurve} />
      </View>

      {/* ── İşletme Kartı ── */}
      <View style={s.bizCard}>
        <View style={[s.bizAvatar, { backgroundColor: planColor + '20' }]}>
          <Text style={[s.bizAvatarTxt, { color: planColor }]}>
            {(profile?.name ?? email).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.bizName}>{profile?.name ?? t('settings_business')}</Text>
          <Text style={s.bizEmail} numberOfLines={1}>{email}</Text>
        </View>
        {profile?.plan && (
          <View style={[s.planPill, { backgroundColor: planColor + '18' }]}>
            <View style={[s.planDot, { backgroundColor: planColor }]} />
            <Text style={[s.planTxt, { color: planColor }]}>{planLabel}</Text>
          </View>
        )}
      </View>

      {/* ── Abonelik Banner ── */}
      {profile && (
        <TouchableOpacity style={[s.subBanner, { borderColor: daysLeft !== null && daysLeft <= 7 ? '#DC2626' : planColor }]}
          onPress={() => router.push('/abonelik' as never)} activeOpacity={0.85}>
          <View style={[s.subBannerLeft, { backgroundColor: (daysLeft !== null && daysLeft <= 7 ? '#DC2626' : planColor) + '15' }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color={daysLeft !== null && daysLeft <= 7 ? '#DC2626' : planColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.subPlan, { color: daysLeft !== null && daysLeft <= 7 ? '#DC2626' : planColor }]}>{planLabel} Plan</Text>
            {daysLeft !== null ? (
              <Text style={s.subSub}>
                {daysLeft <= 0 ? t('menu_planExpired') : daysLeft <= 7 ? t('menu_planEndsIn', { days: daysLeft }) : t('menu_planDaysLeft', { days: daysLeft })}
              </Text>
            ) : profile?.isTurkish ? (
              <Text style={s.subSub}>SMS: {profile.smsUsed ?? 0}/{smsTotal} {t('menu_smsUsed')}</Text>
            ) : null}
          </View>
          {(daysLeft === null || daysLeft > 7) && profile?.isTurkish ? (
            <View style={s.smsBarWrap}>
              <View style={s.smsBarTrack}>
                <View style={[s.smsBarFill, { width: `${smsPct}%` as any, backgroundColor: smsPct >= 80 ? '#DC2626' : planColor }]} />
              </View>
              <Text style={s.smsBarPct}>{Math.round(smsPct)}%</Text>
            </View>
          ) : (daysLeft !== null && daysLeft <= 7) ? (
            <View style={[s.upgradeBtn, { backgroundColor: '#DC2626' }]}>
              <Text style={s.upgradeTxt}>{t('menu_upgrade')}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      )}

      {/* ── Kategori Listeleri ── */}
      {CATEGORIES.map(cat => (
        <View key={cat.title} style={s.section}>
          <Text style={s.sectionTitle}>{cat.title}</Text>
          <View style={s.categoryCard}>
            {cat.items.map((item, idx) => (
              <TouchableOpacity
                key={item.route}
                style={[s.menuRow, idx < cat.items.length - 1 && s.menuRowBorder]}
                onPress={() => router.push(item.route as never)}
                activeOpacity={0.7}
              >
                <View style={[s.menuIcon, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.iconName} size={22} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.menuLabel}>{item.label}</Text>
                  <Text style={s.menuDesc}>{item.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {/* ── Çıkış ── */}
      <View style={s.logoutWrap}>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
          {loggingOut ? (
            <ActivityIndicator color="#EF4444" />
          ) : (
            <>
              <View style={s.logoutIconBox}>
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              </View>
              <Text style={s.logoutTxt}>{t('logout')}</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginLeft: 'auto' }} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={s.versionTxt}>{t('version_txt')}</Text>

      <View style={{ height: 108 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },

  header: {
    backgroundColor: '#7C3AED',
    paddingBottom: 44,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.06, bottom: -20, left: 20 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  heroCurve: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, backgroundColor: '#F4F4F8', borderTopLeftRadius: 28, borderTopRightRadius: 28 },

  bizCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 0,
    borderRadius: 18, padding: 16, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
  },
  bizAvatar: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  bizAvatarTxt: { fontSize: 22, fontWeight: '800' },
  bizName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  bizEmail: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  planPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  planDot: { width: 6, height: 6, borderRadius: 3 },
  planTxt: { fontSize: 11, fontWeight: '800' },

  subBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10,
    borderRadius: 16, padding: 14,
    borderWidth: 1.5,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  subBannerLeft: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  subPlan: { fontSize: 14, fontWeight: '800' },
  subSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  smsBarWrap: { alignItems: 'flex-end', gap: 4 },
  smsBarTrack: { width: 60, height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  smsBarFill: { height: 5, borderRadius: 3 },
  smsBarPct: { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  upgradeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  upgradeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },

  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },

  categoryCard: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  menuIcon: { width: 46, height: 46, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  menuDesc: { fontSize: 12, color: '#9CA3AF' },

  logoutWrap: { paddingHorizontal: 16, marginTop: 16 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  logoutIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  logoutTxt: { color: '#EF4444', fontWeight: '700', fontSize: 15 },

  versionTxt: { textAlign: 'center', fontSize: 11, color: '#D1D5DB', marginTop: 16 },
})
