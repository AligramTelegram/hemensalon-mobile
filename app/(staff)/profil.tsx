import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ScrollView, ActivityIndicator } from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { secureStorage } from '@/lib/secureStorage'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

type StaffData = { name: string; staffId?: string; role?: string }

export default function StaffProfil() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const [staffData, setStaffData] = useState<StaffData | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    secureStorage.getItem('staff_data').then(raw => {
      if (raw) setStaffData(JSON.parse(raw))
    })
  }, [])

  function handleLogout() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert(t('logout'), t('staff_portal_logout_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'), style: 'destructive', onPress: async () => {
          setLoggingOut(true)
          await secureStorage.removeItem('staff_token')
          await secureStorage.removeItem('staff_data')
          await secureStorage.removeItem('mobile_token')
          await secureStorage.removeItem('refresh_token')
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const initials = (staffData?.name ?? 'P').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{initials}</Text>
          </View>
          <View style={s.staffBadge}>
            <Ionicons name="cut-outline" size={11} color="#7C3AED" />
            <Text style={s.staffBadgeTxt}>{t('staff_portal_badge')}</Text>
          </View>
        </View>
        <Text style={s.heroName}>{staffData?.name ?? t('staff_portal_badge')}</Text>
        <Text style={s.heroSub}>{t('staff_portal_sub')}</Text>
      </View>
      <View style={s.heroCurve} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        {/* Bilgi kartı */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('staff_portal_account')}</Text>
          <InfoRow icon="person-outline" label={t('name')} value={staffData?.name ?? '—'} />
          <InfoRow icon="shield-checkmark-outline" label={t('staff_portal_role_label')} value={t('staff_portal_badge')} />
          <InfoRow icon="key-outline" label={t('staff_portal_login_type_label')} value={t('staff_portal_login_type_value')} />
        </View>

        {/* Kısayollar */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('today')}</Text>
          <TouchableOpacity style={s.shortcut} onPress={() => router.push('/(staff)/')}>
            <View style={[s.shortcutIcon, { backgroundColor: '#F5F3FF' }]}>
              <Ionicons name="calendar-outline" size={20} color="#7C3AED" />
            </View>
            <Text style={s.shortcutTxt}>{t('staff_portal_view_apts')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Bilgi notu */}
        <View style={s.noteBox}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
          <Text style={s.noteTxt}>{t('staff_portal_info_note')}</Text>
        </View>

        {/* Çıkış */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
          {loggingOut
            ? <ActivityIndicator color="#EF4444" />
            : <>
                <View style={s.logoutIcon}>
                  <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                </View>
                <Text style={s.logoutTxt}>{t('logout')}</Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={ir.wrap}>
      <View style={ir.iconBox}>
        <Ionicons name={icon as any} size={16} color="#7C3AED" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ir.label}>{label}</Text>
        <Text style={ir.value}>{value}</Text>
      </View>
    </View>
  )
}
const ir = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  iconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 11, color: '#9CA3AF' },
  value: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 1 },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },

  hero: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 20,
    paddingBottom: 28,
    alignItems: 'center',
    overflow: 'hidden',
  },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  heroCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },

  avatarWrap: { alignItems: 'center', marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)' },
  avatarTxt: { fontSize: 32, fontWeight: '900', color: '#fff' },
  staffBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10 },
  staffBadgeTxt: { fontSize: 11, fontWeight: '800', color: '#7C3AED' },

  heroName: { fontSize: 22, fontWeight: '900', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  shortcutIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  shortcutTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },

  noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16 },
  noteTxt: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 18 },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#FECACA' },
  logoutIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  logoutTxt: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
})
