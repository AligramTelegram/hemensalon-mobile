import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Platform, Alert, ScrollView,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { secureStorage } from '@/lib/secureStorage'
import { useRouter } from 'expo-router'
import { staffApi, Appointment } from '@/lib/api'
import { useTranslation } from 'react-i18next'

const STATUS_COLOR: Record<string, string> = {
  BEKLIYOR: '#D97706', ONAYLANDI: '#2563EB',
  TAMAMLANDI: '#059669', IPTAL: '#DC2626', GELMEDI: '#6B7280',
}
const STATUS_BG: Record<string, string> = {
  BEKLIYOR: '#FFFBEB', ONAYLANDI: '#EFF6FF',
  TAMAMLANDI: '#ECFDF5', IPTAL: '#FEF2F2', GELMEDI: '#F9FAFB',
}
const STATUS_LABEL_KEYS: Record<string, string> = {
  BEKLIYOR: 'status_BEKLIYOR', ONAYLANDI: 'status_ONAYLANDI',
  TAMAMLANDI: 'status_TAMAMLANDI', IPTAL: 'status_IPTAL', GELMEDI: 'status_GELMEDI',
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function offsetDate(base: string, offset: number) {
  const d = new Date(base + 'T12:00:00')
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function StaffAppointments() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const [staffData, setStaffData] = useState<{ name: string; staffId?: string } | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null)

  useEffect(() => {
    secureStorage.getItem('staff_data').then(raw => {
      if (raw) setStaffData(JSON.parse(raw))
    })
  }, [])

  const load = useCallback(async (date = selectedDate) => {
    try {
      const mine = await staffApi.appointments.list({ date })
      setAppointments(mine)
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [selectedDate, staffData])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(apt: Appointment, status: string) {
    setUpdatingId(apt.id)
    try {
      const updated = await staffApi.appointments.update(apt.id, { status })
      setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, ...updated } : a))
      setSelectedApt(prev => prev?.id === apt.id ? { ...prev, ...updated } : prev)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch { Alert.alert(t('error'), t('err_updateFailed')) }
    setUpdatingId(null)
  }

  // Tarih seçici için 7 gün
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = offsetDate(todayISO(), i - 0)
    const d = new Date(iso + 'T12:00:00')
    return {
      iso,
      dayName: d.toLocaleDateString(undefined, { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: iso === todayISO(),
    }
  })

  const greeting = (() => {
    const h = new Date().getHours()
    return h < 12 ? t('greeting_morning') : h < 18 ? t('greeting_afternoon') : t('greeting_evening')
  })()

  const completed = appointments.filter(a => a.status === 'TAMAMLANDI').length
  const pending = appointments.filter(a => a.status === 'BEKLIYOR' || a.status === 'ONAYLANDI').length

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />

        <View style={s.heroTop}>
          <View style={s.avatarBox}>
            <Text style={s.avatarTxt}>
              {(staffData?.name ?? 'P').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.greetingTxt}>{greeting}</Text>
            <Text style={s.nameTxt} numberOfLines={1}>{staffData?.name ?? t('staff_title')}</Text>
          </View>
          <View style={s.staffBadge}>
            <Ionicons name="cut-outline" size={12} color="#7C3AED" />
            <Text style={s.staffBadgeTxt}>{t('staff_title')}</Text>
          </View>
        </View>

        {/* Günlük özet */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{appointments.length}</Text>
            <Text style={s.statLabel}>{t('total')}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Text style={s.statNum}>{pending}</Text>
            <Text style={s.statLabel}>{t('status_BEKLIYOR')}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Text style={s.statNum}>{completed}</Text>
            <Text style={s.statLabel}>{t('status_TAMAMLANDI')}</Text>
          </View>
        </View>

        {/* Tarih seçici */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.datePicker} contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}>
          {days.map(d => (
            <TouchableOpacity
              key={d.iso}
              style={[s.dateChip, selectedDate === d.iso && s.dateChipActive]}
              onPress={() => {
                Haptics.selectionAsync()
                setSelectedDate(d.iso)
                setLoading(true)
                load(d.iso)
              }}
            >
              <Text style={[s.dateChipDay, selectedDate === d.iso && s.dateChipTxtActive]}>{d.dayName}</Text>
              <Text style={[s.dateChipNum, selectedDate === d.iso && s.dateChipTxtActive]}>{d.dayNum}</Text>
              {d.isToday && <View style={[s.todayDot, selectedDate === d.iso && { backgroundColor: '#7C3AED' }]} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View style={s.heroCurve} />

      {/* Liste */}
      {loading ? (
        <View style={s.center}><ActivityIndicator color="#7C3AED" size="large" /></View>
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="calendar-outline" size={52} color="#E5E7EB" />
              <Text style={s.emptyTxt}>{t('staff_noAppointments')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.row}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedApt(item) }}
              activeOpacity={0.85}
            >
              <View style={[s.colorBar, { backgroundColor: item.service.color ?? '#7C3AED' }]} />
              <View style={s.rowBody}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTime}>{item.startTime} – {item.endTime}</Text>
                    <Text style={s.rowName}>{item.customer.name}</Text>
                    <Text style={s.rowService}>{item.service.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[s.badge, { backgroundColor: STATUS_BG[item.status] }]}>
                      <Text style={[s.badgeTxt, { color: STATUS_COLOR[item.status] }]}>{t(STATUS_LABEL_KEYS[item.status])}</Text>
                    </View>
                    {item.paid && (
                      <View style={s.paidBadge}>
                        <Ionicons name="checkmark-circle" size={12} color="#059669" />
                        <Text style={s.paidTxt}>{t('paid')}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Hızlı aksiyon butonları */}
                {(item.status === 'BEKLIYOR' || item.status === 'ONAYLANDI') && (
                  <View style={s.quickActions}>
                    <TouchableOpacity
                      style={[s.qBtn, { backgroundColor: '#ECFDF5' }]}
                      onPress={() => handleStatusChange(item, 'TAMAMLANDI')}
                      disabled={!!updatingId}
                    >
                      {updatingId === item.id
                        ? <ActivityIndicator size="small" color="#059669" />
                        : <>
                            <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
                            <Text style={[s.qBtnTxt, { color: '#059669' }]}>{t('status_TAMAMLANDI')}</Text>
                          </>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.qBtn, { backgroundColor: '#FEF2F2' }]}
                      onPress={() => handleStatusChange(item, 'GELMEDI')}
                      disabled={!!updatingId}
                    >
                      <Ionicons name="person-remove-outline" size={14} color="#DC2626" />
                      <Text style={[s.qBtnTxt, { color: '#DC2626' }]}>{t('status_GELMEDI')}</Text>
                    </TouchableOpacity>
                    {item.status === 'BEKLIYOR' && (
                      <TouchableOpacity
                        style={[s.qBtn, { backgroundColor: '#EFF6FF' }]}
                        onPress={() => handleStatusChange(item, 'ONAYLANDI')}
                        disabled={!!updatingId}
                      >
                        <Ionicons name="thumbs-up-outline" size={14} color="#2563EB" />
                        <Text style={[s.qBtnTxt, { color: '#2563EB' }]}>{t('confirm')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Yeni Randevu FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/randevu/yeni' as never) }}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Detay bottom sheet */}
      {selectedApt && (
        <View style={s.sheetOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setSelectedApt(null)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={[s.sheetColorBar, { backgroundColor: selectedApt.service.color ?? '#7C3AED' }]} />

            <Text style={s.sheetName}>{selectedApt.customer.name}</Text>
            <Text style={s.sheetService}>{selectedApt.service.name}</Text>

            <View style={s.sheetGrid}>
              <SheetItem icon="time-outline" label={t('time')} value={`${selectedApt.startTime} – ${selectedApt.endTime}`} />
              <SheetItem icon="call-outline" label={t('phone')} value={selectedApt.customer.phone} />
              <SheetItem icon="cash-outline" label={t('price')} value={`₺${selectedApt.price.toLocaleString()}`} />
              {selectedApt.notes && <SheetItem icon="document-text-outline" label={t('notes')} value={selectedApt.notes} />}
            </View>

            <Text style={s.sheetSectionLabel}>{t('appointments_updateStatus')}</Text>
            <View style={s.sheetStatusRow}>
              {['ONAYLANDI', 'TAMAMLANDI', 'GELMEDI', 'IPTAL'].map(st => (
                <TouchableOpacity
                  key={st}
                  style={[s.sheetStatusBtn, {
                    backgroundColor: selectedApt.status === st ? STATUS_COLOR[st] : STATUS_BG[st],
                    borderColor: STATUS_COLOR[st],
                  }]}
                  onPress={() => handleStatusChange(selectedApt, st)}
                >
                  <Text style={[s.sheetStatusTxt, { color: selectedApt.status === st ? '#fff' : STATUS_COLOR[st] }]}>
                    {t(STATUS_LABEL_KEYS[st])}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={s.sheetClose} onPress={() => setSelectedApt(null)}>
              <Text style={s.sheetCloseTxt}>{t('close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

function SheetItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={si.wrap}>
      <View style={si.iconBox}>
        <Ionicons name={icon as any} size={16} color="#7C3AED" />
      </View>
      <View>
        <Text style={si.label}>{label}</Text>
        <Text style={si.value}>{value}</Text>
      </View>
    </View>
  )
}
const si = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  iconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 11, color: '#9CA3AF' },
  value: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 1 },
})

const PURPLE = '#7C3AED'

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  hero: {
    backgroundColor: PURPLE,
    paddingHorizontal: 20,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  heroCurve: { height: 20, backgroundColor: PURPLE, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },

  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 20, fontWeight: '900', color: '#fff' },
  greetingTxt: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  nameTxt: { fontSize: 17, fontWeight: '800', color: '#fff' },
  staffBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  staffBadgeTxt: { fontSize: 11, fontWeight: '800', color: PURPLE },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 12, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  datePicker: { marginBottom: 4 },
  dateChip: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', minWidth: 52 },
  dateChipActive: { backgroundColor: '#fff' },
  dateChipDay: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  dateChipNum: { fontSize: 18, fontWeight: '900', color: '#fff', marginTop: 1 },
  dateChipTxtActive: { color: PURPLE },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)', marginTop: 3 },

  emptyWrap: { alignItems: 'center', paddingVertical: 64 },
  emptyTxt: { color: '#9CA3AF', fontSize: 14, marginTop: 12 },

  row: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  colorBar: { width: 5 },
  rowBody: { flex: 1, padding: 14 },
  rowTime: { fontSize: 12, color: PURPLE, fontWeight: '700', marginBottom: 2 },
  rowName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  rowService: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  paidBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  paidTxt: { fontSize: 11, color: '#059669', fontWeight: '600' },

  quickActions: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  qBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  qBtnTxt: { fontSize: 12, fontWeight: '700' },

  fab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 114 : 100, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center', shadowColor: '#7C3AED', shadowOpacity: 0.45, shadowRadius: 12, elevation: 10 },

  // Bottom sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 99 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 28 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20 },
  sheetColorBar: { height: 4, borderRadius: 2, marginBottom: 16 },
  sheetName: { fontSize: 22, fontWeight: '900', color: '#111827' },
  sheetService: { fontSize: 14, color: '#6B7280', marginTop: 4, marginBottom: 16 },
  sheetGrid: { marginBottom: 20 },
  sheetSectionLabel: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  sheetStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  sheetStatusBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  sheetStatusTxt: { fontSize: 13, fontWeight: '700' },
  sheetClose: { backgroundColor: '#F3F4F6', borderRadius: 14, padding: 14, alignItems: 'center' },
  sheetCloseTxt: { fontSize: 15, fontWeight: '700', color: '#374151' },
})
