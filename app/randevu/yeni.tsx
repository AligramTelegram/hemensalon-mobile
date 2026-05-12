import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, FlatList,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, Customer, Service, Staff, PlanLimitError } from '@/lib/api'
import * as Notifications from 'expo-notifications'
import { useTranslation } from 'react-i18next'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']
type Step = 0 | 1 | 2 | 3

const HOURS = Array.from({ length: 24 }, (_, i) =>
  [`${String(i).padStart(2, '0')}:00`, `${String(i).padStart(2, '0')}:30`]
).flat().filter(h => {
  const hr = parseInt(h)
  return hr >= 8 && hr <= 20
})

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function nextWeekDays(count = 14, todayLabel: string, tomorrowLabel: string) {
  const days: { iso: string; label: string; dayName: string }[] = []
  const today = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const label = i === 0 ? todayLabel : i === 1 ? tomorrowLabel : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    const dayName = d.toLocaleDateString(undefined, { weekday: 'short' })
    days.push({ iso, label, dayName })
  }
  return days
}

export default function YeniRandevu() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const params = useLocalSearchParams<{ customerId?: string; date?: string }>()

  const STEP_LABELS = [
    t('apt_step_customer'),
    t('apt_step_service'),
    t('apt_step_staff_time'),
    t('apt_step_confirm_label'),
  ]

  const [step, setStep] = useState<Step>(params.customerId ? 1 : 0)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
  const [selectedDate, setSelectedDate] = useState(params.date ?? todayISO())
  const [selectedTime, setSelectedTime] = useState('10:00')
  const [price, setPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [existingAppointments, setExistingAppointments] = useState<{ startTime: string; endTime: string; staffId: string }[]>([])
  const [showSaveCustomerModal, setShowSaveCustomerModal] = useState(false)

  const days = nextWeekDays(14, t('today'), t('tomorrow'))

  const load = useCallback(async () => {
    try {
      const [c, sv, st] = await Promise.all([
        api.customers.list(),
        api.services.list(),
        api.staff.list(),
      ])
      setCustomers(c)
      setServices(sv.filter(s => s.isActive))
      setStaffList(st.filter(s => s.isActive))

      if (params.customerId) {
        const found = c.find(x => x.id === params.customerId)
        if (found) setSelectedCustomer(found)
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const endTime = selectedService ? addMinutes(selectedTime, selectedService.duration) : addMinutes(selectedTime, 60)

  useEffect(() => {
    if (!selectedDate) return
    api.appointments.list({ date: selectedDate })
      .then(apts => setExistingAppointments(apts.map(a => ({ startTime: a.startTime, endTime: a.endTime, staffId: a.staff?.id ?? '' }))))
      .catch(() => {})
  }, [selectedDate])

  function hasConflict(time: string, staffId?: string): boolean {
    if (!staffId || !selectedService) return false
    const end = addMinutes(time, selectedService.duration)
    return existingAppointments.some(a => {
      if (a.staffId !== staffId) return false
      return time < a.endTime && end > a.startTime
    })
  }

  const conflict = selectedStaff ? hasConflict(selectedTime, selectedStaff.id) : false

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  )

  const eligibleStaff = selectedService
    ? staffList.filter(st => st.services.length === 0 || st.services.some(sv => sv.id === selectedService.id))
    : staffList

  function selectCustomer(c: Customer) {
    Haptics.selectionAsync()
    setSelectedCustomer(c)
    setStep(1)
  }

  function selectService(sv: Service) {
    Haptics.selectionAsync()
    setSelectedService(sv)
    setPrice(String(sv.price))
    if (selectedStaff && !eligibleStaff.find(s => s.id === selectedStaff.id)) {
      setSelectedStaff(null)
    }
    setStep(2)
  }

  function selectStaff(st: Staff) {
    Haptics.selectionAsync()
    setSelectedStaff(st)
  }

  function goStep(s: Step) {
    if (s < step) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep(s) }
  }

  async function handleCreate() {
    if (!selectedService || !selectedStaff) {
      Alert.alert(t('warning'), t('apt_required_service_staff')); return
    }
    if (!selectedCustomer && !guestName.trim()) {
      Alert.alert(t('warning'), t('apt_required_customer_name')); return
    }
    setSaving(true)
    try {
      let customerId = selectedCustomer?.id
      if (!customerId && guestName.trim()) {
        const created = await api.customers.create({ name: guestName.trim(), phone: guestPhone.trim() || '—' })
        customerId = created.id
      }
      await api.appointments.create({
        customerId: customerId!,
        serviceId: selectedService.id,
        staffId: selectedStaff.id,
        date: selectedDate,
        startTime: selectedTime,
        endTime,
        price: parseFloat(price) || selectedService.price,
        notes: notes.trim() || undefined,
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

      try {
        const aptDateTime = new Date(`${selectedDate}T${selectedTime}:00`)
        const notifAt = new Date(aptDateTime.getTime() - 60 * 60 * 1000)
        if (notifAt > new Date()) {
          const { status } = await Notifications.getPermissionsAsync()
          const granted = status === 'granted' || (await Notifications.requestPermissionsAsync()).status === 'granted'
          if (granted) {
            const customerLabel = selectedCustomer?.name || guestName.trim()
            await Notifications.scheduleNotificationAsync({
              content: {
                title: t('apt_notif_title'),
                body: t('apt_notif_body', { customer: customerLabel, service: selectedService!.name, time: selectedTime }),
                sound: true,
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notifAt },
            })
          }
        }
      } catch {}

      if (!selectedCustomer && guestName.trim()) {
        setShowSaveCustomerModal(true)
      } else {
        router.back()
      }
    } catch (e: unknown) {
      if (e instanceof PlanLimitError) {
        Alert.alert(
          '🔒 Aylık Randevu Limitine Ulaştınız',
          e.message,
          [
            { text: 'Tamam', style: 'cancel' },
            { text: 'Paketi Yükselt', style: 'default', onPress: () => router.push('/abonelik' as never) },
          ]
        )
      } else {
        Alert.alert(t('error'), e instanceof Error ? e.message : t('apt_err_create'))
      }
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    )
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: headerPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('appointments_new')}</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Step bar */}
      <View style={s.stepBar}>
        {STEP_LABELS.map((label, i) => {
          const done = i < step
          const active = i === step
          return (
            <TouchableOpacity key={i} style={s.stepItem} onPress={() => goStep(i as Step)} activeOpacity={done ? 0.7 : 1}>
              <View style={[s.stepDot, done && s.stepDotDone, active && s.stepDotActive]}>
                {done
                  ? <Ionicons name="checkmark" size={12} color="#fff" />
                  : <Text style={[s.stepDotTxt, active && { color: '#fff' }]}>{i + 1}</Text>
                }
              </View>
              {i < STEP_LABELS.length - 1 && <View style={[s.stepLine, done && s.stepLineDone]} />}
            </TouchableOpacity>
          )
        })}
      </View>
      <Text style={s.stepLabel}>{STEP_LABELS[step]}</Text>

      {/* ── Adım 0: Müşteri Seç ── */}
      {step === 0 && (
        <View style={s.stepContent}>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <TextInput
              style={s.searchInput}
              placeholder={t('customer_searchPlaceholder')}
              placeholderTextColor="#9CA3AF"
              value={customerSearch}
              onChangeText={setCustomerSearch}
              autoFocus
            />
            {customerSearch.length > 0 && (
              <TouchableOpacity onPress={() => setCustomerSearch('')}>
                <Ionicons name="close-circle" size={17} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Kayıtsız müşteri girişi */}
          <View style={s.guestBox}>
            <Text style={s.guestTitle}>{t('apt_guest_title')}</Text>
            <View style={s.guestRow}>
              <View style={[s.searchWrap, { flex: 1, margin: 0, marginRight: 8 }]}>
                <Ionicons name="person-outline" size={15} color="#9CA3AF" />
                <TextInput
                  style={s.searchInput}
                  placeholder={t('apt_guest_name_ph')}
                  placeholderTextColor="#9CA3AF"
                  value={guestName}
                  onChangeText={setGuestName}
                />
              </View>
              <View style={[s.searchWrap, { flex: 1, margin: 0 }]}>
                <Ionicons name="call-outline" size={15} color="#9CA3AF" />
                <TextInput
                  style={s.searchInput}
                  placeholder={t('apt_guest_phone_ph')}
                  placeholderTextColor="#9CA3AF"
                  value={guestPhone}
                  onChangeText={setGuestPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
            {guestName.trim().length > 0 && (
              <TouchableOpacity
                style={s.guestBtn}
                onPress={() => { Haptics.selectionAsync(); setSelectedCustomer(null); setStep(1) }}
              >
                <Ionicons name="arrow-forward-circle-outline" size={16} color="#fff" />
                <Text style={s.guestBtnTxt}>{t('apt_guest_continue')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filteredCustomers}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 16, gap: 8, paddingTop: 8 }}
            ListHeaderComponent={<Text style={s.listHeader}>{t('apt_registered_customers')}</Text>}
            ListEmptyComponent={<Text style={s.empty}>{t('customer_empty')}</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.listRow} onPress={() => selectCustomer(item)}>
                <View style={[s.listAvatar, { backgroundColor: '#EDE9FE' }]}>
                  <Text style={s.listAvatarTxt}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.listRowName}>{item.name}</Text>
                  <Text style={s.listRowSub}>{item.phone} · {t('customer_visitsCount', { count: item.totalVisits })}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* ── Adım 1: Hizmet Seç ── */}
      {step === 1 && (
        <ScrollView style={s.stepContent} contentContainerStyle={{ padding: 16, gap: 8 }}>
          <SelectedBadge icon="person-outline" label={selectedCustomer?.name ?? guestName} onClear={() => { setSelectedCustomer(null); setGuestName(''); setGuestPhone(''); setStep(0) }} />
          {services.length === 0 && <Text style={s.empty}>{t('apt_no_active_services')}</Text>}
          {services.map(sv => (
            <TouchableOpacity key={sv.id} style={[s.listRow, selectedService?.id === sv.id && s.listRowActive]} onPress={() => selectService(sv)}>
              <View style={[s.colorDot, { backgroundColor: sv.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.listRowName}>{sv.name}</Text>
                <Text style={s.listRowSub}>{t('appointments_duration', { duration: sv.duration })}</Text>
              </View>
              <Text style={s.listRowPrice}>₺{sv.price}</Text>
              {selectedService?.id === sv.id && <Ionicons name="checkmark-circle" size={20} color="#2563EB" style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Adım 2: Personel & Saat ── */}
      {step === 2 && (
        <ScrollView style={s.stepContent} contentContainerStyle={{ padding: 16 }}>
          <SelectedBadge icon="cut-outline" label={selectedService?.name ?? ''} onClear={() => { setSelectedService(null); setStep(1) }} />

          <Text style={s.sectionLabel}>{t('apt_field_staff')}</Text>
          <View style={{ gap: 8, marginBottom: 20 }}>
            {eligibleStaff.map(st => (
              <TouchableOpacity
                key={st.id}
                style={[s.staffRow, selectedStaff?.id === st.id && { borderColor: st.color, backgroundColor: st.color + '10' }]}
                onPress={() => selectStaff(st)}
              >
                <View style={[s.staffAvatar, { backgroundColor: st.color + '25' }]}>
                  <Text style={[s.staffAvatarTxt, { color: st.color }]}>{st.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.staffName}>{st.name}</Text>
                  {st.title && <Text style={s.staffTitle}>{st.title}</Text>}
                </View>
                {selectedStaff?.id === st.id && <Ionicons name="checkmark-circle" size={20} color={st.color} />}
              </TouchableOpacity>
            ))}
            {eligibleStaff.length === 0 && <Text style={s.empty}>{t('apt_no_eligible_staff')}</Text>}
          </View>

          <Text style={s.sectionLabel}>{t('apt_field_date')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
              {days.map(d => (
                <TouchableOpacity
                  key={d.iso}
                  style={[s.dayChip, selectedDate === d.iso && s.dayChipActive]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedDate(d.iso) }}
                >
                  <Text style={[s.dayChipName, selectedDate === d.iso && s.dayChipTxtActive]}>{d.dayName}</Text>
                  <Text style={[s.dayChipLabel, selectedDate === d.iso && s.dayChipTxtActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={s.sectionLabel}>{t('startTime')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: conflict ? 8 : 20 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
              {HOURS.map(hr => {
                const isConflict = selectedStaff ? hasConflict(hr, selectedStaff.id) : false
                return (
                  <TouchableOpacity
                    key={hr}
                    style={[s.timeChip, selectedTime === hr && s.timeChipActive, isConflict && s.timeChipConflict]}
                    onPress={() => { Haptics.selectionAsync(); setSelectedTime(hr) }}
                  >
                    <Text style={[s.timeChipTxt, selectedTime === hr && s.timeChipTxtActive, isConflict && s.timeChipConflictTxt]}>{hr}</Text>
                    {isConflict && <Ionicons name="close" size={10} color="#DC2626" />}
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>
          {conflict && (
            <View style={s.conflictBanner}>
              <Ionicons name="warning-outline" size={15} color="#DC2626" />
              <Text style={s.conflictTxt}>{t('apt_conflict_msg', { name: selectedStaff?.name })}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.nextBtn, !selectedStaff && s.nextBtnDisabled]}
            disabled={!selectedStaff}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setStep(3) }}
          >
            <Text style={s.nextBtnTxt}>{t('apt_continue')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Adım 3: Onay ── */}
      {step === 3 && (
        <ScrollView style={s.stepContent} contentContainerStyle={{ padding: 16 }}>
          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>{t('apt_summary_title')}</Text>
            <SummaryRow icon="person-outline" label={t('apt_field_customer')} value={selectedCustomer?.name ?? `${guestName}${guestPhone ? ` · ${guestPhone}` : ''} ${t('apt_field_guest_suffix')}`} />
            <SummaryRow icon="cut-outline" label={t('apt_field_service')} value={selectedService?.name ?? ''} />
            <SummaryRow icon="people-outline" label={t('apt_field_staff')} value={selectedStaff?.name ?? ''} />
            <SummaryRow icon="calendar-outline" label={t('apt_field_date')}
              value={new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} />
            <SummaryRow icon="time-outline" label={t('apt_field_time')} value={`${selectedTime} – ${endTime} (${t('appointments_duration', { duration: selectedService?.duration })})`} />
          </View>

          <Text style={s.sectionLabel}>{t('apt_price_label')}</Text>
          <TextInput
            style={s.input}
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
            placeholder={String(selectedService?.price ?? 0)}
            placeholderTextColor="#9CA3AF"
          />

          <Text style={s.sectionLabel}>{t('apt_note_label')}</Text>
          <TextInput
            style={[s.input, { height: 80, textAlignVertical: 'top' }]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('apt_note_placeholder')}
            placeholderTextColor="#9CA3AF"
            multiline
          />

          <TouchableOpacity style={s.createBtn} onPress={handleCreate} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={s.createBtnTxt}>{t('apt_create_btn')}</Text>
                </>
            }
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Müşteriyi kaydet modal */}
      {showSaveCustomerModal && (
        <View style={s.saveModalOverlay}>
          <View style={s.saveModal}>
            <View style={s.saveModalIcon}>
              <Ionicons name="person-add-outline" size={32} color="#2563EB" />
            </View>
            <Text style={s.saveModalTitle}>{t('apt_save_customer_title')}</Text>
            <Text style={s.saveModalSub}>
              {t('apt_save_customer_sub', { name: `${guestName}${guestPhone ? ` (${guestPhone})` : ''}` })}
            </Text>
            <TouchableOpacity
              style={s.saveModalPrimary}
              onPress={() => { setShowSaveCustomerModal(false); router.back() }}
            >
              <Text style={s.saveModalPrimaryTxt}>{t('apt_save_yes')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.saveModalSecondary}
              onPress={() => { setShowSaveCustomerModal(false); router.back() }}
            >
              <Text style={s.saveModalSecondaryTxt}>{t('apt_save_no')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

function SelectedBadge({ icon, label, onClear }: { icon: IoniconsName; label: string; onClear: () => void }) {
  return (
    <View style={s.selectedBadge}>
      <Ionicons name={icon} size={14} color="#2563EB" />
      <Text style={s.selectedBadgeTxt} numberOfLines={1}>{label}</Text>
      <TouchableOpacity onPress={onClear}>
        <Ionicons name="close-circle" size={16} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  )
}

function SummaryRow({ icon, label, value }: { icon: IoniconsName; label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Ionicons name={icon} size={15} color="#9CA3AF" />
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2563EB', paddingBottom: 16, paddingHorizontal: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },

  stepBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2563EB', paddingHorizontal: 28, paddingBottom: 20 },
  stepItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  stepDotDone: { backgroundColor: '#10B981' },
  stepDotActive: { backgroundColor: '#fff' },
  stepDotTxt: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)' },
  stepLine: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 4 },
  stepLineDone: { backgroundColor: '#10B981' },
  stepLabel: { textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#374151', paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },

  stepContent: { flex: 1 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E5E7EB', height: 46 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 32, fontSize: 14 },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6' },
  listRowActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  listAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  listAvatarTxt: { fontSize: 16, fontWeight: '800', color: '#7C3AED' },
  listRowName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  listRowSub: { fontSize: 12, color: '#9CA3AF' },
  listRowPrice: { fontSize: 15, fontWeight: '800', color: '#111827' },
  colorDot: { width: 12, height: 12, borderRadius: 6 },

  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, borderWidth: 1, borderColor: '#BFDBFE' },
  selectedBadgeTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: '#2563EB' },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6' },
  staffAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  staffAvatarTxt: { fontSize: 16, fontWeight: '800' },
  staffName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  staffTitle: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  dayChip: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB', minWidth: 64 },
  dayChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  dayChipName: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase' },
  dayChipLabel: { fontSize: 13, fontWeight: '800', color: '#111827', marginTop: 2 },
  dayChipTxtActive: { color: '#fff' },

  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB' },
  timeChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  timeChipConflict: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  timeChipTxt: { fontSize: 14, fontWeight: '700', color: '#374151' },
  timeChipTxtActive: { color: '#fff' },
  timeChipConflictTxt: { color: '#DC2626' },
  conflictBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  conflictTxt: { flex: 1, fontSize: 12, color: '#DC2626', fontWeight: '600' },

  nextBtn: { backgroundColor: '#2563EB', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  nextBtnDisabled: { backgroundColor: '#BFDBFE' },
  nextBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  summaryCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  summaryLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', width: 68 },
  summaryValue: { flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' },

  input: { backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 16 },

  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563EB', padding: 16, borderRadius: 14, marginTop: 8 },
  createBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  guestBox: { margin: 16, marginTop: 8, marginBottom: 0, backgroundColor: '#EFF6FF', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#BFDBFE' },
  guestTitle: { fontSize: 12, fontWeight: '700', color: '#2563EB', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  guestRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  guestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 11 },
  guestBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  listHeader: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  saveModalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  saveModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: Platform.OS === 'ios' ? 44 : 28 },
  saveModalIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 },
  saveModalTitle: { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 8 },
  saveModalSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  saveModalPrimary: { backgroundColor: '#2563EB', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
  saveModalPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  saveModalSecondary: { borderRadius: 14, padding: 14, alignItems: 'center' },
  saveModalSecondaryTxt: { color: '#9CA3AF', fontWeight: '600', fontSize: 15 },
})
