import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { PUSH_NOTIFS_KEY, type StoredPushNotif } from '../_layout'

const STAFF_READ_KEY = 'staff_push_read_ids'

async function getReadIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STAFF_READ_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

export default function StaffBildirimler() {
  const { t } = useTranslation()
  const headerPad = useHeaderPad()
  const [pushNotifs, setPushNotifs] = useState<StoredPushNotif[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pushRaw, ids] = await Promise.all([
        AsyncStorage.getItem(PUSH_NOTIFS_KEY).catch(() => null),
        getReadIds(),
      ])
      setPushNotifs(pushRaw ? JSON.parse(pushRaw) : [])
      setReadIds(ids)
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handlePress(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const ids = new Set([...readIds, id])
    setReadIds(ids)
    // Hem push listesini oku olarak işaretle hem de staff read key'ini güncelle
    const updated = pushNotifs.map(n => n.id === id ? { ...n, read: true } : n)
    setPushNotifs(updated)
    await Promise.all([
      AsyncStorage.setItem(PUSH_NOTIFS_KEY, JSON.stringify(updated)),
      AsyncStorage.setItem(STAFF_READ_KEY, JSON.stringify([...ids])),
    ])
  }

  const now = Date.now()
  const newNotifs = pushNotifs.filter(n => !n.read && !readIds.has(n.id) && now - n.receivedAt < 24 * 60 * 60 * 1000)
  const oldNotifs = pushNotifs.filter(n => n.read || readIds.has(n.id) || now - n.receivedAt >= 24 * 60 * 60 * 1000)

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.headerTopRow}>
          <Text style={s.headerTitle}>{t('notifications')}</Text>
          {newNotifs.length > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeTxt}>{newNotifs.length}</Text>
            </View>
          )}
        </View>
        <Text style={s.headerSub}>{t('staff_notif_sub')}</Text>
      </View>
      <View style={s.headerCurve} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#7C3AED" /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}
        >
          {newNotifs.length > 0 && (
            <>
              <Text style={s.sectionLabel}>{t('notifications_new')}</Text>
              {newNotifs.map(n => (
                <NotifRow key={n.id} n={n} isNew onPress={() => handlePress(n.id)} />
              ))}
            </>
          )}

          {oldNotifs.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: newNotifs.length > 0 ? 20 : 0 }]}>
                {t('notif_section_old')}
              </Text>
              {oldNotifs.map(n => (
                <NotifRow key={n.id} n={n} isNew={false} onPress={() => {}} />
              ))}
            </>
          )}

          {pushNotifs.length === 0 && (
            <View style={s.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={56} color="#E5E7EB" />
              <Text style={s.emptyTxt}>{t('notifications_empty')}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function NotifRow({ n, isNew, onPress }: { n: StoredPushNotif; isNew: boolean; onPress: () => void }) {
  const timeAgo = (() => {
    const diff = Date.now() - n.receivedAt
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '< 1dk'
    if (mins < 60) return `${mins}dk`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}sa`
    return `${Math.floor(hrs / 24)}g`
  })()

  const type = (n.data?.type as string) ?? ''
  const iconName: React.ComponentProps<typeof Ionicons>['name'] =
    type === 'completion_reminder' ? 'time' :
    type === 'appointment_status' ? 'checkmark-circle' :
    type === 'new_appointment'    ? 'calendar' : 'notifications'
  const iconColor =
    type === 'completion_reminder' ? '#D97706' :
    type === 'appointment_status'  ? '#059669' :
    type === 'new_appointment'     ? '#7C3AED' : '#2563EB'
  const iconBg =
    type === 'completion_reminder' ? '#FFFBEB' :
    type === 'appointment_status'  ? '#ECFDF5' :
    type === 'new_appointment'     ? '#EDE9FE' : '#EFF6FF'

  return (
    <TouchableOpacity style={[nr.row, isNew && nr.rowNew]} onPress={onPress} activeOpacity={0.75}>
      <View style={[nr.icon, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={[nr.title, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{n.title}</Text>
          <Text style={nr.time}>{timeAgo}</Text>
        </View>
        <Text style={nr.body} numberOfLines={2}>{n.body}</Text>
      </View>
      {isNew && <View style={nr.dot} />}
    </TouchableOpacity>
  )
}

const nr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  rowNew: { borderLeftWidth: 3, borderLeftColor: '#7C3AED' },
  icon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: '700', color: '#111827' },
  body: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  time: { fontSize: 11, color: '#9CA3AF' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED', marginTop: 4, flexShrink: 0 },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#7C3AED', paddingHorizontal: 16, paddingBottom: 0, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16 },
  headerCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  badge: { backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyWrap: { alignItems: 'center', paddingVertical: 64 },
  emptyTxt: { color: '#9CA3AF', marginTop: 12, fontSize: 14 },
})
