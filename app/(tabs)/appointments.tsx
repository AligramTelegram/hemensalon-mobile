import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, ActivityIndicator,
  ScrollView, Platform, Animated, PanResponder,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, Appointment, Customer, Service, Staff, WaitingEntry } from '@/lib/api'
import { detectCountry, getPricing } from '@/lib/pricing'
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
const STATUSES = ['BEKLIYOR', 'ONAYLANDI', 'TAMAMLANDI', 'IPTAL', 'GELMEDI']
const FILTER_STATUS_KEYS = [
  { value: 'ALL', key: 'all' },
  { value: 'BEKLIYOR', key: 'status_BEKLIYOR' },
  { value: 'ONAYLANDI', key: 'status_ONAYLANDI' },
  { value: 'TAMAMLANDI', key: 'status_TAMAMLANDI' },
  { value: 'IPTAL', key: 'status_IPTAL' },
]

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Appointments() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [symbol, setSymbol] = useState('₺')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterDate, setFilterDate] = useState(todayISO())
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [staffFilter, setStaffFilter] = useState('ALL')
  const [showNew, setShowNew] = useState(false)
  const [detailApt, setDetailApt] = useState<Appointment | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ date: '', startTime: '', endTime: '', staffId: '', serviceId: '', price: '', notes: '' })
  const [form, setForm] = useState({ customerId: '', serviceId: '', staffId: '', date: todayISO(), startTime: '10:00', endTime: '11:00', price: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const updatingStatusIds = useRef<Set<string>>(new Set())

  const [mainTab, setMainTab] = useState<'randevular' | 'bekleme'>('randevular')
  const [waitingList, setWaitingList] = useState<WaitingEntry[]>([])
  const [waitingLoading, setWaitingLoading] = useState(false)
  const [showWaitingModal, setShowWaitingModal] = useState(false)
  const [waitingForm, setWaitingForm] = useState({ customerName: '', customerPhone: '', serviceName: '', preferredDate: '', preferredTime: '', notes: '' })
  const [savingWaiting, setSavingWaiting] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'month'>('list')
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d
  })
  const [weekApts, setWeekApts] = useState<Appointment[]>([])
  const [monthApts, setMonthApts] = useState<Appointment[]>([])
  const [monthDate, setMonthDate] = useState(() => new Date())

  const load = useCallback(async (date = filterDate) => {
    try {
      const [apts, country] = await Promise.all([api.appointments.list({ date }), detectCountry()])
      setAppointments(apts)
      setSymbol(getPricing(country).symbol)
    } catch (e: unknown) {
      console.warn('Failed to load appointments', e)
      Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed'))
    }
    setLoading(false)
    setRefreshing(false)
  }, [filterDate, t])

  useEffect(() => {
    load()
    api.staff.list().then(setStaffList).catch((e: unknown) => {
      console.warn('Failed to load staff list', e)
      Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed'))
    })
  }, [load, t])

  useEffect(() => {
    if (viewMode !== 'calendar') return
    const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    Promise.all(
      Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return api.appointments.list({ date: toISO(d) }) })
    ).then(results => setWeekApts(results.flat())).catch(() => {})
  }, [viewMode, weekStart])

  useEffect(() => {
    if (viewMode !== 'month') return
    const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const year = monthDate.getFullYear(); const month = monthDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    Promise.all(
      Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(year, month, i + 1); return api.appointments.list({ date: toISO(d) })
      })
    ).then(results => setMonthApts(results.flat())).catch(() => {})
  }, [viewMode, monthDate])

  const filtered = appointments
    .filter(a => statusFilter === 'ALL' || a.status === statusFilter)
    .filter(a => staffFilter === 'ALL' || a.staff?.id === staffFilter)

  const eligibleStaffForEdit = editForm.serviceId
    ? staffList.filter(st => st.services.length === 0 || st.services.some(sv => sv.id === editForm.serviceId))
    : staffList

  async function loadFormData() {
    const [c, sv, st] = await Promise.all([api.customers.list(), api.services.list(), api.staff.list()])
    setCustomers(c); setServices(sv); setStaffList(st)
  }

  async function loadWaiting() {
    setWaitingLoading(true)
    try { setWaitingList(await api.waitingList.list()) } catch {}
    setWaitingLoading(false)
  }

  useEffect(() => {
    if (mainTab === 'bekleme') loadWaiting()
  }, [mainTab])

  async function handleAddWaiting() {
    if (!waitingForm.customerName.trim() || !waitingForm.customerPhone.trim()) {
      Alert.alert(t('warning'), t('waiting_nameRequired')); return
    }
    setSavingWaiting(true)
    try {
      const entry = await api.waitingList.create({
        customerName: waitingForm.customerName.trim(),
        customerPhone: waitingForm.customerPhone.trim(),
        preferredDate: waitingForm.preferredDate || undefined,
        preferredTime: waitingForm.preferredTime || undefined,
        notes: waitingForm.notes || undefined,
      })
      setWaitingList(prev => [entry, ...prev])
      setShowWaitingModal(false)
      setWaitingForm({ customerName: '', customerPhone: '', serviceName: '', preferredDate: '', preferredTime: '', notes: '' })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_createFailed')) }
    setSavingWaiting(false)
  }

  async function handleWaitingStatus(id: string, status: 'BILDIRILDI' | 'IPTAL') {
    try {
      const updated = await api.waitingList.update(id, { status })
      setWaitingList(prev => prev.map(w => w.id === id ? { ...w, ...updated } : w))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch { Alert.alert(t('error'), t('err_updateFailed')) }
  }

  async function handleDeleteWaiting(id: string) {
    Alert.alert(t('delete'), t('waiting_deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        try { await api.waitingList.delete(id); setWaitingList(prev => prev.filter(w => w.id !== id)) }
        catch { Alert.alert(t('error'), t('err_deleteFailed')) }
      }},
    ])
  }

  function openNew() {
    router.push(`/randevu/yeni?date=${filterDate}` as never)
  }

  async function handleCreate() {
    if (!form.customerId || !form.serviceId || !form.staffId || !form.price) {
      Alert.alert(t('warning'), t('waiting_nameRequired'))
      return
    }
    setSaving(true)
    try {
      await api.appointments.create({
        customerId: form.customerId, serviceId: form.serviceId, staffId: form.staffId,
        date: form.date, startTime: form.startTime, endTime: form.endTime,
        price: parseFloat(form.price), notes: form.notes || undefined,
      })
      setShowNew(false)
      load(form.date)
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_createFailed')) }
    setSaving(false)
  }

  async function handleStatusChange(id: string, status: string) {
    if (updatingStatusIds.current.has(id)) return
    updatingStatusIds.current.add(id)
    try {
      const updated = await api.appointments.update(id, { status })
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a))
      setDetailApt(prev => prev?.id === id ? { ...prev, ...updated } : prev)
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_updateFailed')) }
    finally { updatingStatusIds.current.delete(id) }
  }

  function openEditMode(apt: Appointment) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditForm({
      date: apt.date,
      startTime: apt.startTime,
      endTime: apt.endTime,
      staffId: apt.staff?.id ?? '',
      serviceId: apt.service.id,
      price: String(apt.price),
      notes: apt.notes ?? '',
    })
    setEditMode(true)
  }

  async function handleSaveEdit() {
    if (!detailApt) return
    setSaving(true)
    try {
      // Çakışma kontrolü
      if (editForm.staffId) {
        const dayApts = await api.appointments.list({ date: editForm.date })
        const conflict = dayApts.some(a => {
          if (a.id === detailApt.id || a.staff?.id !== editForm.staffId) return false
          return editForm.startTime < a.endTime && editForm.endTime > a.startTime
        })
        if (conflict) {
          Alert.alert(t('appointments_conflictTitle'), t('appointments_conflict'))
          setSaving(false)
          return
        }
      }
      const updated = await api.appointments.update(detailApt.id, {
        date: editForm.date,
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        staffId: editForm.staffId || undefined,
        price: parseFloat(editForm.price),
        notes: editForm.notes || undefined,
      })
      setDetailApt(prev => prev ? { ...prev, ...updated } : prev)
      setAppointments(prev => prev.map(a => a.id === detailApt.id ? { ...a, ...updated } : a))
      setEditMode(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e: unknown) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('err_updateFailed'))
    }
    setSaving(false)
  }

  async function handleTogglePaid(id: string, paid: boolean) {
    try {
      await api.appointments.update(id, { paid })
      setDetailApt(prev => prev?.id === id ? { ...prev, paid } : prev)
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, paid } : a))
      Haptics.selectionAsync()
    } catch { Alert.alert(t('error'), t('appointments_paymentUpdated')) }
  }


  async function handleDelete(id: string) {
    Alert.alert(t('appointments_delete'), t('appointments_deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        try {
          await api.appointments.update(id, { status: 'IPTAL' })
          load()
          setDetailApt(null)
        } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_deleteFailed')) }
      }},
    ])
  }

  function changeDate(offset: number) {
    const d = new Date(filterDate)
    d.setDate(d.getDate() + offset)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setFilterDate(iso); setLoading(true); load(iso)
  }

  const formattedDate = new Date(filterDate + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })
  const isToday = filterDate === todayISO()

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.heroTopRow}>
          <TouchableOpacity style={s.homeBtn} onPress={() => router.push('/')}>
            <Ionicons name="home-outline" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[s.addBtn, { paddingHorizontal: 10 }]} onPress={() => { Haptics.selectionAsync(); setViewMode(v => v === 'list' ? 'calendar' : v === 'calendar' ? 'month' : 'list') }}>
              <Ionicons name={viewMode === 'list' ? 'calendar-outline' : viewMode === 'calendar' ? 'grid-outline' : 'list-outline'} size={16} color="#7C3AED" />
            </TouchableOpacity>
            <TouchableOpacity style={s.addBtn} onPress={openNew}>
              <Ionicons name="add" size={16} color="#7C3AED" />
              <Text style={s.addBtnTxt}>{t('new')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={s.heroTitle}>{t('appointments')}</Text>
        <Text style={s.heroSub}>{t('appointments_listed', { count: appointments.length })}</Text>

        {/* Ana sekme */}
        <View style={s.mainTabBar}>
          <TouchableOpacity style={[s.mainTab, mainTab === 'randevular' && s.mainTabActive]} onPress={() => { Haptics.selectionAsync(); setMainTab('randevular') }}>
            <Text style={[s.mainTabTxt, mainTab === 'randevular' && s.mainTabTxtActive]}>{t('appointments_tab')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.mainTab, mainTab === 'bekleme' && s.mainTabActive]} onPress={() => { Haptics.selectionAsync(); setMainTab('bekleme') }}>
            <Text style={[s.mainTabTxt, mainTab === 'bekleme' && s.mainTabTxtActive]}>{t('appointments_tab_waiting')}</Text>
            {waitingList.filter(w => w.status === 'BEKLIYOR').length > 0 && (
              <View style={s.mainTabBadge}><Text style={s.mainTabBadgeTxt}>{waitingList.filter(w => w.status === 'BEKLIYOR').length}</Text></View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <View style={s.heroCurve} />

      {/* Tarih navigasyon */}
      <View style={s.dateBar}>
        <TouchableOpacity style={s.arrow} onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={22} color="#7C3AED" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.dateLabel}>{formattedDate}</Text>
          {isToday && <Text style={s.todayBadge}>{t('today')}</Text>}
        </View>
        <TouchableOpacity style={s.arrow} onPress={() => changeDate(1)}>
          <Ionicons name="chevron-forward" size={22} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      {/* Status filtresi */}
      <View style={s.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterContent}>
          {FILTER_STATUS_KEYS.map(opt => (
            <TouchableOpacity key={opt.value}
              style={[s.filterChip, statusFilter === opt.value && s.filterChipActive]}
              onPress={() => { Haptics.selectionAsync(); setStatusFilter(opt.value) }}>
              <Text style={[s.filterTxt, statusFilter === opt.value && s.filterTxtActive]}>{t(opt.key)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Personel filtresi */}
      {staffList.length > 0 && (
        <View style={s.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterContent}>
            <TouchableOpacity
              style={[s.filterChip, s.staffChip, staffFilter === 'ALL' && s.staffChipActive]}
              onPress={() => { Haptics.selectionAsync(); setStaffFilter('ALL') }}>
              <Text style={[s.filterTxt, staffFilter === 'ALL' && s.filterTxtActive]}>{t('all')}</Text>
            </TouchableOpacity>
            {staffList.map(st => (
              <TouchableOpacity key={st.id}
                style={[s.filterChip, s.staffChip, staffFilter === st.id && s.staffChipActive, staffFilter === st.id && { backgroundColor: st.color + '20', borderColor: st.color }]}
                onPress={() => { Haptics.selectionAsync(); setStaffFilter(st.id) }}>
                <View style={[s.staffDot, { backgroundColor: st.color }]} />
                <Text style={[s.filterTxt, staffFilter === st.id && { color: st.color, fontWeight: '700' }]}>{st.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {mainTab === 'bekleme' ? (
        <>
          {waitingLoading ? (
            <View style={s.center}><ActivityIndicator color="#7C3AED" /></View>
          ) : (
            <FlatList
              data={waitingList}
              keyExtractor={i => i.id}
              contentContainerStyle={{ padding: 12, paddingBottom: 108 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Ionicons name="hourglass-outline" size={48} color="#E5E7EB" />
                  <Text style={{ color: '#9CA3AF', marginTop: 12, fontSize: 14 }}>{t('waiting_empty')}</Text>
                </View>
              }
              renderItem={({ item }) => {
                const statusColor = item.status === 'BEKLIYOR' ? '#D97706' : item.status === 'BILDIRILDI' ? '#059669' : '#6B7280'
                const statusBg = item.status === 'BEKLIYOR' ? '#FFFBEB' : item.status === 'BILDIRILDI' ? '#ECFDF5' : '#F9FAFB'
                const statusLabel = t(item.status === 'BEKLIYOR' ? 'status_BEKLIYOR' : item.status === 'BILDIRILDI' ? 'status_BILDIRILDI' : 'status_IPTAL')
                return (
                  <View style={s.waitRow}>
                    <View style={s.waitLeft}>
                      <View style={s.waitAvatar}><Text style={s.waitAvatarTxt}>{item.customerName.charAt(0).toUpperCase()}</Text></View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={s.waitName}>{item.customerName}</Text>
                        <View style={[s.badge, { backgroundColor: statusBg }]}>
                          <Text style={[s.badgeTxt, { color: statusColor }]}>{statusLabel}</Text>
                        </View>
                      </View>
                      <Text style={s.waitPhone}>{item.customerPhone}</Text>
                      {(item.preferredDate || item.preferredTime) && (
                        <Text style={s.waitMeta}>
                          {[item.preferredDate, item.preferredTime].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      {item.notes && <Text style={s.waitNote}>{item.notes}</Text>}
                      {item.status === 'BEKLIYOR' && (
                        <View style={s.waitActions}>
                          <TouchableOpacity style={s.waitActionBtn} onPress={() => handleWaitingStatus(item.id, 'BILDIRILDI')}>
                            <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
                            <Text style={[s.waitActionTxt, { color: '#059669' }]}>{t('waiting_notify')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.waitActionBtn, { backgroundColor: '#EFF6FF' }]} onPress={() => router.push(`/randevu/yeni` as never)}>
                            <Ionicons name="calendar-outline" size={14} color="#2563EB" />
                            <Text style={[s.waitActionTxt, { color: '#2563EB' }]}>{t('waiting_bookAppointment')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteWaiting(item.id)} style={s.waitDeleteBtn}>
                            <Ionicons name="trash-outline" size={14} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                )
              }}
            />
          )}

          {/* Bekleme listesi ekle butonu */}
          <TouchableOpacity style={s.waitAddFab} onPress={() => setShowWaitingModal(true)}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>

          {/* Bekleme listesi modal */}
          <Modal visible={showWaitingModal} animationType="slide" presentationStyle="pageSheet">
            <View style={s.modal}>
              <ModalHeader title={t('waiting_add')} onClose={() => setShowWaitingModal(false)} />
              <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
                <Label>{t('waiting_nameSurname')}</Label>
                <TextInput style={s.input} value={waitingForm.customerName} onChangeText={v => setWaitingForm(f => ({ ...f, customerName: v }))} placeholder={t('name')} placeholderTextColor="#9CA3AF" />
                <Label>{t('waiting_phone')}</Label>
                <TextInput style={s.input} value={waitingForm.customerPhone} onChangeText={v => setWaitingForm(f => ({ ...f, customerPhone: v }))} placeholder="05XX XXX XX XX" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Label>{t('waiting_prefDate')}</Label>
                    <TextInput style={s.input} value={waitingForm.preferredDate} onChangeText={v => setWaitingForm(f => ({ ...f, preferredDate: v }))} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Label>{t('waiting_prefTime')}</Label>
                    <TextInput style={s.input} value={waitingForm.preferredTime} onChangeText={v => setWaitingForm(f => ({ ...f, preferredTime: v }))} placeholder="10:00" placeholderTextColor="#9CA3AF" />
                  </View>
                </View>
                <Label>{t('waiting_note')}</Label>
                <TextInput style={[s.input, { height: 80 }]} value={waitingForm.notes} onChangeText={v => setWaitingForm(f => ({ ...f, notes: v }))} multiline placeholder={t('optional')} placeholderTextColor="#9CA3AF" />
                <TouchableOpacity style={s.saveBtn} onPress={handleAddWaiting} disabled={savingWaiting}>
                  {savingWaiting ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('waiting_addToList')}</Text>}
                </TouchableOpacity>
                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          </Modal>
        </>
      ) : loading ? (
        <View style={s.center}><ActivityIndicator color="#7C3AED" /></View>
      ) : viewMode === 'month' ? (
        <MonthlyCalendar
          monthDate={monthDate}
          appointments={monthApts}
          onPrev={() => { const d = new Date(monthDate); d.setMonth(d.getMonth() - 1); setMonthDate(new Date(d)) }}
          onNext={() => { const d = new Date(monthDate); d.setMonth(d.getMonth() + 1); setMonthDate(new Date(d)) }}
          onSelectDay={(iso) => { setFilterDate(iso); setViewMode('list'); load(iso) }}
        />
      ) : viewMode === 'calendar' ? (
        <WeeklyCalendar
          weekStart={weekStart}
          appointments={weekApts}
          symbol={symbol}
          onPrev={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(new Date(d)) }}
          onNext={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(new Date(d)) }}
          onSelectDay={(iso) => { setFilterDate(iso); setViewMode('list'); load(iso) }}
          onSelectApt={(a) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDetailApt(a) }}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 108 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}
          ListEmptyComponent={<Text style={s.empty}>{t('appointments_empty')}</Text>}
          renderItem={({ item }) => (
            <SwipeableRow
              onSwipeLeft={() => handleStatusChange(item.id, 'TAMAMLANDI')}
              onSwipeRight={() => handleDelete(item.id)}
            >
              <TouchableOpacity style={s.row} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDetailApt(item) }}>
                <View style={[s.colorBar, { backgroundColor: item.service.color ?? '#7C3AED' }]} />
                <View style={s.rowBody}>
                  <View style={s.rowTop}>
                    <View style={s.rowLeft}>
                      <Text style={s.rowTime}>{item.startTime} – {item.endTime}</Text>
                      <Text style={s.rowCustomer}>{item.customer.name}</Text>
                      <Text style={s.rowMeta}>{item.service.name}{item.staff ? ` · ${item.staff.name}` : ''}</Text>
                    </View>
                    <View style={s.rowRight}>
                      <Text style={s.rowPrice}>{symbol}{item.price.toLocaleString()}</Text>
                      <View style={[s.badge, { backgroundColor: STATUS_BG[item.status] }]}>
                        <Text style={[s.badgeTxt, { color: STATUS_COLOR[item.status] }]}>{t(STATUS_LABEL_KEYS[item.status])}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          )}
        />
      )}

      {/* Yeni Randevu Modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <ModalHeader title={t('appointments_new')} onClose={() => setShowNew(false)} />
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Label>{t('appointments_customer')} *</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
              {customers.map(c => <Chip key={c.id} label={c.name} sub={c.phone} active={form.customerId === c.id} onPress={() => setForm(f => ({ ...f, customerId: c.id }))} />)}
            </ScrollView>

            <Label>{t('appointments_service')} *</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
              {services.map(sv => <Chip key={sv.id} label={sv.name} sub={t('appointments_duration', { duration: sv.duration })} color={sv.color} active={form.serviceId === sv.id}
                onPress={() => {
                  const [h, m] = form.startTime.split(':').map(Number)
                  const total = h * 60 + m + sv.duration
                  const end = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
                  setForm(f => ({ ...f, serviceId: sv.id, price: String(sv.price), endTime: end }))
                }} />)}
            </ScrollView>

            <Label>{t('appointments_staff')} *</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
              {(form.serviceId
                ? staffList.filter(st => st.services.length === 0 || st.services.some(sv => sv.id === form.serviceId))
                : staffList
              ).map(st => <Chip key={st.id} label={st.name} color={st.color} active={form.staffId === st.id} onPress={() => setForm(f => ({ ...f, staffId: st.id }))} />)}
            </ScrollView>

            <Label>{t('date')} *</Label>
            <TextInput style={s.input} value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Label>{t('startTime')} *</Label>
                <TextInput style={s.input} value={form.startTime} onChangeText={v => setForm(f => ({ ...f, startTime: v }))} placeholder="10:00" placeholderTextColor="#9CA3AF" />
              </View>
              <View style={{ flex: 1 }}>
                <Label>{t('endTime')} *</Label>
                <TextInput style={s.input} value={form.endTime} onChangeText={v => setForm(f => ({ ...f, endTime: v }))} placeholder="11:00" placeholderTextColor="#9CA3AF" />
              </View>
            </View>

            <Label>{t('price')} *</Label>
            <TextInput style={s.input} value={form.price} onChangeText={v => setForm(f => ({ ...f, price: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor="#9CA3AF" />

            <Label>{t('notes')}</Label>
            <TextInput style={[s.input, { height: 80 }]} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline placeholder={t('optional')} placeholderTextColor="#9CA3AF" />

            <TouchableOpacity style={s.saveBtn} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('appointments_create')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Detay Modal */}
      <Modal visible={!!detailApt} animationType="slide" presentationStyle="pageSheet">
        {detailApt && (
          <View style={s.modal}>
            <View style={mh.wrap}>
              <Text style={mh.title}>{editMode ? t('appointments_edit') : t('appointments_detail')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {!editMode && (
                  <TouchableOpacity style={[mh.closeBtn, { backgroundColor: '#EDE9FE' }]} onPress={() => openEditMode(detailApt)}>
                    <Ionicons name="pencil-outline" size={16} color="#7C3AED" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={mh.closeBtn} onPress={() => { setDetailApt(null); setEditMode(false) }}>
                  <Ionicons name="close" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </View>

            {editMode ? (
              <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
                {/* Müşteri + Hizmet (salt okunur) */}
                <View style={[s.detailCard, { borderLeftColor: detailApt.service.color ?? '#7C3AED', marginBottom: 16 }]}>
                  <Text style={s.detailCustomer}>{detailApt.customer.name}</Text>
                  <Text style={s.detailService}>{detailApt.service.name}</Text>
                </View>

                <Label>{t('date')} *</Label>
                <TextInput style={s.input} value={editForm.date} onChangeText={v => setEditForm(f => ({ ...f, date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" />

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Label>{t('startTime')} *</Label>
                    <TextInput style={s.input} value={editForm.startTime} onChangeText={v => setEditForm(f => ({ ...f, startTime: v }))} placeholder="10:00" placeholderTextColor="#9CA3AF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Label>{t('endTime')} *</Label>
                    <TextInput style={s.input} value={editForm.endTime} onChangeText={v => setEditForm(f => ({ ...f, endTime: v }))} placeholder="11:00" placeholderTextColor="#9CA3AF" />
                  </View>
                </View>

                <Label>{t('appointments_service')}</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                  {services.map(sv => (
                    <Chip key={sv.id} label={sv.name} sub={t('appointments_duration', { duration: sv.duration })} color={sv.color}
                      active={editForm.serviceId === sv.id}
                      onPress={() => setEditForm(f => ({ ...f, serviceId: sv.id }))} />
                  ))}
                </ScrollView>

                <Label>{t('appointments_staff')}</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                  <Chip label={t('none')} active={editForm.staffId === ''} onPress={() => setEditForm(f => ({ ...f, staffId: '' }))} />
                  {eligibleStaffForEdit.map(st => (
                    <Chip key={st.id} label={st.name} color={st.color} active={editForm.staffId === st.id} onPress={() => setEditForm(f => ({ ...f, staffId: st.id }))} />
                  ))}
                </ScrollView>

                <Label>{t('price')} *</Label>
                <TextInput style={s.input} value={editForm.price} onChangeText={v => setEditForm(f => ({ ...f, price: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor="#9CA3AF" />

                <Label>{t('notes')}</Label>
                <TextInput style={[s.input, { height: 80 }]} value={editForm.notes} onChangeText={v => setEditForm(f => ({ ...f, notes: v }))} multiline placeholder={t('optional')} placeholderTextColor="#9CA3AF" />

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                  <TouchableOpacity style={[s.saveBtn, { flex: 1, backgroundColor: '#F3F4F6' }]} onPress={() => setEditMode(false)}>
                    <Text style={[s.saveTxt, { color: '#374151' }]}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.saveBtn, { flex: 1 }]} onPress={handleSaveEdit} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('save')}</Text>}
                  </TouchableOpacity>
                </View>
                <View style={{ height: 40 }} />
              </ScrollView>
            ) : (
              <ScrollView style={s.modalBody}>
                <View style={[s.detailCard, { borderLeftColor: detailApt.service.color ?? '#7C3AED' }]}>
                  <Text style={s.detailCustomer}>{detailApt.customer.name}</Text>
                  <Text style={s.detailService}>{detailApt.service.name}</Text>
                </View>

                <View style={s.detailGrid}>
                  <DetailItem iconName="call-outline" label={t('phone')} value={detailApt.customer.phone} />
                  <DetailItem iconName="calendar-outline" label={t('date')} value={new Date(detailApt.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} />
                  <DetailItem iconName="time-outline" label={t('time')} value={`${detailApt.startTime} – ${detailApt.endTime}`} />
                  {detailApt.staff && <DetailItem iconName="cut-outline" label={t('appointments_staff')} value={detailApt.staff.name} />}
                  <DetailItem iconName="cash-outline" label={t('price')} value={`${symbol}${detailApt.price.toLocaleString()}`} />
                  {detailApt.notes && <DetailItem iconName="document-text-outline" label={t('notes')} value={detailApt.notes} />}
                </View>

<Text style={s.sectionLabel}>{t('appointments_updateStatus')}</Text>
                <View style={s.statusGrid}>
                  {STATUSES.map(st => (
                    <TouchableOpacity key={st}
                      style={[s.statusBtn, { backgroundColor: detailApt.status === st ? STATUS_COLOR[st] : STATUS_BG[st], borderColor: STATUS_COLOR[st] }]}
                      onPress={() => handleStatusChange(detailApt.id, st)}>
                      <Text style={[s.statusBtnTxt, { color: detailApt.status === st ? '#fff' : STATUS_COLOR[st] }]}>{t(STATUS_LABEL_KEYS[st])}</Text>
                    </TouchableOpacity>
                  ))}
                </View>


                <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(detailApt.id)}>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={s.deleteTxt}>{t('appointments_cancel')}</Text>
                </TouchableOpacity>
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        )}
      </Modal>
    </View>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={mh.wrap}>
      <Text style={mh.title}>{title}</Text>
      <TouchableOpacity style={mh.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={18} color="#6B7280" />
      </TouchableOpacity>
    </View>
  )
}
const mh = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
})

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 }}>{children}</Text>
}

function Chip({ label, sub, color, active, onPress }: { label: string; sub?: string; color?: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[ch.wrap, { borderColor: active ? (color ?? '#7C3AED') : '#E5E7EB', backgroundColor: active ? (color ?? '#7C3AED') + '15' : '#fff' }]}>
      {color && <View style={[ch.dot, { backgroundColor: color }]} />}
      <View>
        <Text style={[ch.label, { color: active ? (color ?? '#7C3AED') : '#374151' }]}>{label}</Text>
        {sub && <Text style={ch.sub}>{sub}</Text>}
      </View>
    </TouchableOpacity>
  )
}
const ch = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, borderWidth: 1.5 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  label: { fontSize: 13, fontWeight: '600' },
  sub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
})

function DetailItem({ iconName, label, value }: { iconName: string; label: string; value: string }) {
  return (
    <View style={di.wrap}>
      <View style={di.iconWrap}>
        <Ionicons name={iconName as any} size={18} color="#7C3AED" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={di.label}>{label}</Text>
        <Text style={di.value}>{value}</Text>
      </View>
    </View>
  )
}
const di = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 12 },
  iconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  label: { fontSize: 11, color: '#9CA3AF' },
  value: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 2 },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { backgroundColor: '#7C3AED', paddingBottom: 28, paddingHorizontal: 20, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  homeBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  heroCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnTxt: { color: '#7C3AED', fontWeight: '700', fontSize: 13 },
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  arrow: { padding: 8 },
  dateLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  todayBadge: { fontSize: 10, color: '#7C3AED', fontWeight: '700', marginTop: 2 },
  filterBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', height: 40 },
  filterContent: { paddingHorizontal: 10, gap: 6, alignItems: 'center', height: 40 },
  filterChip: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20, backgroundColor: '#F3F4F6' },
  filterChipActive: { backgroundColor: '#7C3AED' },
  filterTxt: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  filterTxtActive: { color: '#fff' },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 48, fontSize: 14 },
  row: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  colorBar: { width: 4 },
  rowBody: { flex: 1, padding: 14 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLeft: { flex: 1 },
  rowTime: { fontSize: 12, color: '#7C3AED', fontWeight: '700', marginBottom: 2 },
  rowCustomer: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rowMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowPrice: { fontSize: 14, fontWeight: '800', color: '#111827' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalBody: { flex: 1, padding: 20 },
  chipRow: { marginBottom: 4 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB' },
  saveBtn: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  detailCard: { backgroundColor: '#fff', borderRadius: 14, padding: 20, borderLeftWidth: 4, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  detailCustomer: { fontSize: 20, fontWeight: '800', color: '#111827' },
  detailService: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  detailGrid: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  statusBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  statusBtnTxt: { fontSize: 13, fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14 },
  deleteTxt: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1.5, padding: 14, marginBottom: 20 },
  paidDot: { width: 10, height: 10, borderRadius: 5 },
  paidTxt: { fontSize: 14, fontWeight: '700' },
  gelirBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 12, padding: 14, marginBottom: 12 },
  gelirTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  staffChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  staffChipActive: { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' },
  staffDot: { width: 6, height: 6, borderRadius: 3 },

  mainTabBar: { flexDirection: 'row', gap: 8, marginTop: 16 },
  mainTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  mainTabActive: { backgroundColor: '#fff' },
  mainTabTxt: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  mainTabTxtActive: { color: '#7C3AED' },
  mainTabBadge: { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  mainTabBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },

  waitRow: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 14, marginBottom: 8, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  waitLeft: {},
  waitAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center' },
  waitAvatarTxt: { fontSize: 16, fontWeight: '800', color: '#7C3AED' },
  waitName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  waitPhone: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  waitMeta: { fontSize: 12, color: '#7C3AED', fontWeight: '600', marginTop: 4 },
  waitNote: { fontSize: 12, color: '#6B7280', marginTop: 3, fontStyle: 'italic' },
  waitActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  waitActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  waitActionTxt: { fontSize: 11, fontWeight: '700' },
  waitDeleteBtn: { backgroundColor: '#FEF2F2', padding: 5, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  waitAddFab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 114 : 100, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center', shadowColor: '#7C3AED', shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
})

function MonthlyCalendar({ monthDate, appointments, onPrev, onNext, onSelectDay }: {
  monthDate: Date; appointments: Appointment[]
  onPrev: () => void; onNext: () => void; onSelectDay: (iso: string) => void
}) {
  const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const todayISO = toISO(new Date())
  const year = monthDate.getFullYear(); const month = monthDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay() // 0=Sun
  const startOffset = firstDow === 0 ? 6 : firstDow - 1 // convert to Mon-first
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7
  const dayNames = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']
  const monthLabel = monthDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })

  const aptCounts: Record<string, number> = {}
  appointments.forEach(a => {
    const key = a.date?.split('T')[0]
    if (key) aptCounts[key] = (aptCounts[key] ?? 0) + 1
  })

  return (
    <View style={{ flex: 1 }}>
      <View style={mc.navRow}>
        <TouchableOpacity onPress={onPrev} style={mc.navBtn}><Ionicons name="chevron-back" size={20} color="#7C3AED" /></TouchableOpacity>
        <Text style={mc.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={onNext} style={mc.navBtn}><Ionicons name="chevron-forward" size={20} color="#7C3AED" /></TouchableOpacity>
      </View>
      <View style={mc.dayHeaders}>
        {dayNames.map(d => <Text key={d} style={mc.dayHeaderTxt}>{d}</Text>)}
      </View>
      <ScrollView contentContainerStyle={{ padding: 8, paddingBottom: 108 }}>
        <View style={mc.grid}>
          {Array.from({ length: totalCells }, (_, i) => {
            const dayNum = i - startOffset + 1
            if (dayNum < 1 || dayNum > daysInMonth) return <View key={i} style={mc.cell} />
            const d = new Date(year, month, dayNum)
            const iso = toISO(d)
            const count = aptCounts[iso] ?? 0
            const isToday = iso === todayISO
            return (
              <TouchableOpacity key={i} style={[mc.cell, isToday && mc.cellToday]} onPress={() => { Haptics.selectionAsync(); onSelectDay(iso) }}>
                <Text style={[mc.cellNum, isToday && mc.cellNumToday]}>{dayNum}</Text>
                {count > 0 && (
                  <View style={mc.dotRow}>
                    {Array.from({ length: Math.min(count, 3) }, (_, j) => (
                      <View key={j} style={[mc.dot, count >= 3 && j === 2 && { backgroundColor: '#7C3AED' }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}
const mc = StyleSheet.create({
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  navBtn: { padding: 8 },
  monthLabel: { fontSize: 14, fontWeight: '800', color: '#111827' },
  dayHeaders: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 6 },
  dayHeaderTxt: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, padding: 2 },
  cellToday: { backgroundColor: '#F5F3FF' },
  cellNum: { fontSize: 14, fontWeight: '600', color: '#374151' },
  cellNumToday: { color: '#7C3AED', fontWeight: '900' },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#2563EB' },
})

function WeeklyCalendar({ weekStart, appointments, symbol, onPrev, onNext, onSelectDay, onSelectApt }: {
  weekStart: Date; appointments: Appointment[]; symbol: string
  onPrev: () => void; onNext: () => void
  onSelectDay: (iso: string) => void; onSelectApt: (a: Appointment) => void
}) {
  const { t } = useTranslation()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
  })
  const todayISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const dayNames = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']

  const weekLabel = `${days[0].getDate()} ${days[0].toLocaleDateString('tr-TR',{month:'short'})} – ${days[6].getDate()} ${days[6].toLocaleDateString('tr-TR',{month:'short'})}`

  return (
    <View style={{ flex: 1 }}>
      <View style={wc.navRow}>
        <TouchableOpacity onPress={onPrev} style={wc.navBtn}><Ionicons name="chevron-back" size={20} color="#7C3AED" /></TouchableOpacity>
        <Text style={wc.weekLabel}>{weekLabel}</Text>
        <TouchableOpacity onPress={onNext} style={wc.navBtn}><Ionicons name="chevron-forward" size={20} color="#7C3AED" /></TouchableOpacity>
      </View>
      <View style={wc.dayHeaders}>
        {days.map((d, i) => {
          const iso = toISO(d); const isToday = iso === todayISO
          const count = appointments.filter(a => a.date?.startsWith(iso)).length
          return (
            <TouchableOpacity key={i} style={[wc.dayCol, isToday && wc.dayColToday]} onPress={() => onSelectDay(iso)}>
              <Text style={[wc.dayName, isToday && wc.dayNameToday]}>{dayNames[i]}</Text>
              <Text style={[wc.dayNum, isToday && wc.dayNumToday]}>{d.getDate()}</Text>
              {count > 0 && <View style={wc.countBadge}><Text style={wc.countTxt}>{count}</Text></View>}
            </TouchableOpacity>
          )
        })}
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 108 }}>
        {days.map((d, di) => {
          const iso = toISO(d)
          const dayApts = appointments.filter(a => a.date?.startsWith(iso))
          if (dayApts.length === 0) return null
          return (
            <View key={di} style={{ marginBottom: 16 }}>
              <Text style={wc.daySection}>{dayNames[di]}, {d.getDate()} {d.toLocaleDateString('tr-TR',{month:'long'})}</Text>
              {dayApts.map(a => (
                <TouchableOpacity key={a.id} style={wc.aptRow} onPress={() => onSelectApt(a)}>
                  <View style={[wc.aptBar, { backgroundColor: a.service.color ?? '#7C3AED' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={wc.aptTime}>{a.startTime} – {a.endTime}</Text>
                    <Text style={wc.aptCustomer}>{a.customer.name}</Text>
                    <Text style={wc.aptMeta}>{a.service.name}</Text>
                  </View>
                  <View style={[wc.aptBadge, { backgroundColor: STATUS_BG[a.status] }]}>
                    <Text style={[wc.aptBadgeTxt, { color: STATUS_COLOR[a.status] }]}>{t(STATUS_LABEL_KEYS[a.status])}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )
        })}
        {days.every(d => appointments.filter(a => a.date?.startsWith(toISO(d))).length === 0) && (
          <Text style={{ textAlign: 'center', color: '#9CA3AF', paddingVertical: 48, fontSize: 14 }}>{t('no_appointments_week')}</Text>
        )}
      </ScrollView>
    </View>
  )
}
const wc = StyleSheet.create({
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  navBtn: { padding: 8 },
  weekLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
  dayHeaders: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dayCol: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  dayColToday: { backgroundColor: '#F5F3FF' },
  dayName: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', marginBottom: 4 },
  dayNameToday: { color: '#7C3AED' },
  dayNum: { fontSize: 15, fontWeight: '700', color: '#374151' },
  dayNumToday: { color: '#7C3AED' },
  countBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  countTxt: { fontSize: 9, color: '#fff', fontWeight: '800' },
  daySection: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 8, textTransform: 'uppercase' },
  aptRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, padding: 12, gap: 10 },
  aptBar: { width: 4, height: '100%', borderRadius: 2, position: 'absolute', left: 0, top: 0, bottom: 0 },
  aptTime: { fontSize: 11, color: '#7C3AED', fontWeight: '700', marginBottom: 2, marginLeft: 8 },
  aptCustomer: { fontSize: 13, fontWeight: '700', color: '#111827', marginLeft: 8 },
  aptMeta: { fontSize: 11, color: '#9CA3AF', marginLeft: 8, marginTop: 1 },
  aptBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  aptBadgeTxt: { fontSize: 10, fontWeight: '700' },
})

function SwipeableRow({ children, onSwipeLeft, onSwipeRight }: { children: React.ReactNode; onSwipeLeft: () => void; onSwipeRight: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => { translateX.setValue(Math.max(-80, Math.min(80, g.dx))) },
    onPanResponderRelease: (_, g) => {
      if (g.dx < -60) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        onSwipeLeft()
      } else if (g.dx > 60) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        onSwipeRight()
      }
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start()
    },
  })).current

  return (
    <View style={{ marginBottom: 8 }}>
      {/* Arka plan aksiyonları */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', borderRadius: 14, overflow: 'hidden' }}>
        <View style={{ backgroundColor: '#FEF2F2', flex: 1, justifyContent: 'center', paddingLeft: 16 }}>
          <Ionicons name="trash-outline" size={20} color="#DC2626" />
        </View>
        <View style={{ backgroundColor: '#ECFDF5', flex: 1, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 16 }}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#059669" />
        </View>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  )
}
