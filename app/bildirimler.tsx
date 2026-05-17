import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, Notification } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { PUSH_NOTIFS_KEY, type StoredPushNotif } from './_layout'

const READ_KEY = 'read_notification_ids'

async function getReadIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(READ_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

async function markAsRead(id: string) {
  try {
    const ids = await getReadIds()
    ids.add(id)
    await AsyncStorage.setItem(READ_KEY, JSON.stringify([...ids]))
  } catch {}
}

const STATUS_COLOR: Record<string, string> = {
  BEKLIYOR: '#D97706', ONAYLANDI: '#2563EB',
  TAMAMLANDI: '#059669', IPTAL: '#DC2626', GELMEDI: '#6B7280',
}
const STATUS_BG: Record<string, string> = {
  BEKLIYOR: '#FFFBEB', ONAYLANDI: '#EFF6FF',
  TAMAMLANDI: '#ECFDF5', IPTAL: '#FEF2F2', GELMEDI: '#F9FAFB',
}

export default function Bildirimler() {
  const { t } = useTranslation()
  const headerPad = useHeaderPad()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [pushNotifs, setPushNotifs] = useState<StoredPushNotif[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, ids, pushRaw] = await Promise.all([
        api.notifications.list(),
        getReadIds(),
        AsyncStorage.getItem(PUSH_NOTIFS_KEY).catch(() => null),
      ])
      setNotifications(list)
      setReadIds(ids)
      setPushNotifs(pushRaw ? JSON.parse(pushRaw) : [])
    } catch (e) {
      console.warn('load notifications failed:', e)
      setNotifications([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleNotifPress(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await markAsRead(id)
    setReadIds(prev => new Set([...prev, id]))
  }

  async function handlePushPress(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const updated = pushNotifs.map(n => n.id === id ? { ...n, read: true } : n)
    setPushNotifs(updated)
    await AsyncStorage.setItem(PUSH_NOTIFS_KEY, JSON.stringify(updated))
  }

  // Son 24 saatte gelen push'lar "yeni"
  const now = Date.now()
  const newPush = pushNotifs.filter(n => !n.read && now - n.receivedAt < 24 * 60 * 60 * 1000)
  const oldPush = pushNotifs.filter(n => n.read || now - n.receivedAt >= 24 * 60 * 60 * 1000)

  const newNotifs = notifications.filter(n => n.isNew && !readIds.has(n.id))
  const oldNotifs = notifications.filter(n => !n.isNew || readIds.has(n.id))

  const totalNew = newPush.length + newNotifs.length

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          {totalNew > 0 && (
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeTxt}>{t('notif_new_badge', { count: totalNew })}</Text>
            </View>
          )}
        </View>
        <Text style={s.headerTitle}>{t('notifications')}</Text>
        <Text style={s.headerSub}>{t('notif_push_sub')}</Text>
      </View>
      <View style={s.headerCurve} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#7C3AED" /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}
        >
          {/* ── Yeni push bildirimleri ── */}
          {newPush.length > 0 && (
            <>
              <Text style={s.sectionLabel}>{t('notifications_new')}</Text>
              {newPush.map(n => (
                <PushRow key={n.id} n={n} isNew onPress={() => handlePushPress(n.id)} />
              ))}
            </>
          )}

          {/* ── Yeni randevu bildirimleri ── */}
          {newNotifs.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: newPush.length > 0 ? 16 : 0 }]}>
                {t('notif_section_appointments')}
              </Text>
              {newNotifs.map(n => (
                <NotifRow key={n.id} n={n} isNew onPress={() => handleNotifPress(n.id)} />
              ))}
            </>
          )}

          {/* ── Eski bildirimler ── */}
          {(oldPush.length > 0 || oldNotifs.length > 0) && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 20 }]}>{t('notif_section_old')}</Text>
              {oldPush.map(n => (
                <PushRow key={n.id} n={n} isNew={false} onPress={() => {}} />
              ))}
              {oldNotifs.map(n => (
                <NotifRow key={n.id} n={n} isNew={false} onPress={() => {}} />
              ))}
            </>
          )}

          {pushNotifs.length === 0 && notifications.length === 0 && (
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

function PushRow({ n, isNew, onPress }: { n: StoredPushNotif; isNew: boolean; onPress: () => void }) {
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
  const iconName = type === 'new_appointment' ? 'calendar' :
                   type === 'appointment_status' ? 'checkmark-circle' : 'notifications'
  const iconColor = type === 'new_appointment' ? '#7C3AED' :
                    type === 'appointment_status' ? '#059669' : '#2563EB'
  const iconBg = type === 'new_appointment' ? '#EDE9FE' :
                 type === 'appointment_status' ? '#ECFDF5' : '#EFF6FF'

  return (
    <TouchableOpacity style={[nr.row, isNew && nr.rowNew]} onPress={onPress} activeOpacity={0.75}>
      <View style={[nr.icon, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName as never} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={[nr.customer, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{n.title}</Text>
          <Text style={nr.timeAgo}>{timeAgo}</Text>
        </View>
        <Text style={nr.service} numberOfLines={2}>{n.body}</Text>
      </View>
      {isNew && <View style={nr.dot} />}
    </TouchableOpacity>
  )
}

function NotifRow({ n, isNew, onPress }: { n: Notification; isNew: boolean; onPress: () => void }) {
  const color = STATUS_COLOR[n.status] ?? '#6B7280'
  const bg = STATUS_BG[n.status] ?? '#F9FAFB'
  return (
    <TouchableOpacity style={[nr.row, isNew && nr.rowNew]} onPress={onPress} activeOpacity={0.75}>
      <View style={[nr.icon, { backgroundColor: bg }]}>
        <Ionicons name="cut-outline" size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={nr.customer}>{n.customerName}</Text>
          <Text style={nr.timeAgo}>{n.timeAgo}</Text>
        </View>
        <Text style={nr.service}>{n.serviceName}</Text>
        <View style={[nr.statusPill, { backgroundColor: bg }]}>
          <Text style={[nr.statusTxt, { color }]}>{n.statusLabel}</Text>
        </View>
      </View>
      {isNew && <View style={nr.dot} />}
    </TouchableOpacity>
  )
}

const nr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  rowNew: { borderLeftWidth: 3, borderLeftColor: '#7C3AED' },
  icon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  customer: { fontSize: 14, fontWeight: '700', color: '#111827' },
  service: { fontSize: 12, color: '#6B7280', marginTop: 2, marginBottom: 6 },
  timeAgo: { fontSize: 11, color: '#9CA3AF' },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED', marginTop: 4, flexShrink: 0 },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#7C3AED', paddingBottom: 0, paddingHorizontal: 16, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerBadge: { backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  headerBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyWrap: { alignItems: 'center', paddingVertical: 64 },
  emptyTxt: { color: '#9CA3AF', marginTop: 12, fontSize: 14 },
})
