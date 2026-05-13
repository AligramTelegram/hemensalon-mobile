import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Platform, RefreshControl, TextInput, Modal,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, StaffDetail, Leave } from '@/lib/api'
import { useTranslation } from 'react-i18next'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

const STATUS_COLOR: Record<string, string> = {
  BEKLIYOR: '#D97706', ONAYLANDI: '#2563EB',
  TAMAMLANDI: '#059669', IPTAL: '#DC2626', GELMEDI: '#6B7280',
}
const STATUS_LABEL_KEYS: Record<string, string> = {
  BEKLIYOR: 'status_pending', ONAYLANDI: 'status_confirmed',
  TAMAMLANDI: 'status_completed', IPTAL: 'status_cancelled', GELMEDI: 'status_noshow',
}

const LEAVE_COLOR: Record<string, string> = { IZIN: '#2563EB', TATIL: '#7C3AED', HASTALIK: '#DC2626', DIGER: '#6B7280' }
const LEAVE_BG: Record<string, string> = { IZIN: '#EFF6FF', TATIL: '#F5F3FF', HASTALIK: '#FEF2F2', DIGER: '#F3F4F6' }
const LEAVE_LABEL_KEYS: Record<string, string> = {
  IZIN: 'personel_leave_label_IZIN', TATIL: 'personel_leave_label_TATIL',
  HASTALIK: 'personel_leave_label_HASTALIK', DIGER: 'personel_leave_label_DIGER',
}

const WORK_HOURS = Array.from({ length: 14 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`)

export default function PersonelDetay() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const headerPad = useHeaderPad()

  const WORK_DAYS = [
    { label: t('day_mon'), day: 1 }, { label: t('day_tue'), day: 2 },
    { label: t('day_wed'), day: 3 }, { label: t('day_thu'), day: 4 },
    { label: t('day_fri'), day: 5 }, { label: t('day_sat'), day: 6 },
    { label: t('day_sun'), day: 7 },
  ]

  const [staff, setStaff] = useState<StaffDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'genel' | 'randevular' | 'program' | 'izin'>('genel')

  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [commissionRate, setCommissionRate] = useState('')
  const [savingCommission, setSavingCommission] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showNewPass, setShowNewPass] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [leavesLoading, setLeavesLoading] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ type: 'IZIN' as Leave['type'], startDate: '', endDate: '', reason: '' })
  const [savingLeave, setSavingLeave] = useState(false)
  const [showStartPicker, setShowStartPicker] = useState(false)
  const [showEndPicker, setShowEndPicker] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const data = await api.staffDetail.get(id)
      setStaff(data)
      if (data.commissionRate != null) setCommissionRate(String(data.commissionRate))
    } catch {
      Alert.alert(t('error'), t('personel_load_failed')); router.back()
    }
    setLoading(false); setRefreshing(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleToggleActive() {
    if (!staff) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const stateLabel = staff.isActive ? t('personel_make_passive') : t('personel_make_active')
    Alert.alert(
      stateLabel,
      t('personel_toggle_confirm', { name: staff.name, state: stateLabel }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('yes'), onPress: async () => {
            try {
              const updated = await api.staff.update(staff.id, { isActive: !staff.isActive })
              setStaff(prev => prev ? { ...prev, ...updated } : prev)
            } catch { Alert.alert(t('error'), t('err_failed')) }
          },
        },
      ]
    )
  }

  async function loadLeaves() {
    if (!id) return
    setLeavesLoading(true)
    try { setLeaves(await api.leaves.list(id)) } catch { setLeaves([]) }
    setLeavesLoading(false)
  }

  async function handleSaveLeave() {
    if (!id || !leaveForm.startDate || !leaveForm.endDate) {
      Alert.alert(t('warning'), t('personel_leave_dates_required'))
      return
    }
    setSavingLeave(true)
    try {
      const newLeave = await api.leaves.create(id, {
        type: leaveForm.type,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason || undefined,
      })
      setLeaves(prev => [newLeave, ...prev])
      setShowLeaveModal(false)
      setLeaveForm({ type: 'IZIN', startDate: '', endDate: '', reason: '' })
      setShowStartPicker(false)
      setShowEndPicker(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e: unknown) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed'))
    }
    setSavingLeave(false)
  }

  async function handleDeleteLeave(leaveId: string) {
    if (!id) return
    Alert.alert(t('personel_delete_leave'), t('personel_delete_leave_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        try {
          await api.leaves.delete(id, leaveId)
          setLeaves(prev => prev.filter(l => l.id !== leaveId))
        } catch { Alert.alert(t('error'), t('err_failed')) }
      }},
    ])
  }

  async function handleSavePassword() {
    if (newPassword.length < 6) { Alert.alert(t('warning'), t('staff_password_min')); return }
    setSavingPassword(true)
    try {
      await api.staff.update(staff!.id, { password: newPassword } as any)
      setNewPassword('')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('success'), t('personel_password_saved'))
    } catch { Alert.alert(t('error'), t('err_failed')) }
    setSavingPassword(false)
  }

  async function handleSaveCommission() {
    if (!staff) return
    const rate = parseFloat(commissionRate)
    if (isNaN(rate) || rate < 0 || rate > 100) { Alert.alert(t('warning'), t('personel_invalid_percent')); return }
    setSavingCommission(true)
    try {
      await api.staff.update(staff.id, { commissionRate: rate } as any)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('success'), t('personel_commission_saved'))
    } catch { Alert.alert(t('error'), t('err_failed')) }
    setSavingCommission(false)
  }

  async function handleSaveSchedule() {
    if (!staff) return
    if (workDays.length === 0) { Alert.alert(t('warning'), t('personel_min_day_required')); return }
    setSavingSchedule(true)
    try {
      await api.staffDetail.updateSchedule(staff.id, { workDays, startTime, endTime })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('success'), t('personel_schedule_saved'))
    } catch (e: unknown) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed'))
    }
    setSavingSchedule(false)
  }

  function toggleDay(day: number) {
    Haptics.selectionAsync()
    setWorkDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#7C3AED" /></View>
  if (!staff) return null

  const stats = staff.monthStats ?? { count: 0, revenue: 0, completedCount: 0 }
  const completionRate = stats.count > 0 ? Math.round((stats.completedCount / stats.count) * 100) : 0
  const recentApts = (staff.appointments ?? []).slice(0, 30)

  const TABS: { key: 'genel' | 'randevular' | 'program' | 'izin'; label: string }[] = [
    { key: 'genel', label: t('personel_tab_general') },
    { key: 'randevular', label: t('personel_tab_appointments') },
    { key: 'program', label: t('personel_tab_schedule') },
    { key: 'izin', label: t('personel_tab_leave') },
  ]

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { backgroundColor: staff.color, paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.heroTopRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.statusToggle, { backgroundColor: staff.isActive ? 'rgba(255,255,255,0.2)' : 'rgba(239,68,68,0.3)' }]}
            onPress={handleToggleActive}
          >
            <View style={[s.statusDot, { backgroundColor: staff.isActive ? '#6EE7B7' : '#FCA5A5' }]} />
            <Text style={s.statusTxt}>{staff.isActive ? t('active') : t('passive')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.heroBody}>
          <View style={[s.avatar, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Text style={s.avatarTxt}>{staff.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroName}>{staff.name}</Text>
            {staff.title && <Text style={s.heroTitle}>{staff.title}</Text>}
            {staff.phone && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <Ionicons name="call-outline" size={12} color="rgba(255,255,255,0.7)" />
                <Text style={s.heroMeta}>{staff.phone}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={[s.heroCurve, { backgroundColor: staff.color }]} />

      {/* İstatistik kartları */}
      <View style={s.statsRow}>
        <StatCard icon="calendar-outline" label={t('personel_this_month')} value={String(stats.count)} sub={t('personel_apt_label')} color={staff.color} />
        <StatCard icon="checkmark-done-outline" label={t('personel_completion_label')} value={`%${completionRate}`} sub={t('personel_rate_label')} color="#059669" />
        <StatCard icon="wallet-outline" label={t('personel_revenue_label')} value={`₺${stats.revenue.toLocaleString()}`} sub={t('personel_this_month')} color="#D97706" />
      </View>

      {/* Sekmeler */}
      <View style={s.tabBar}>
        {TABS.map(tb => (
          <TouchableOpacity
            key={tb.key}
            style={[s.tab, activeTab === tb.key && [s.tabActive, { borderBottomColor: staff.color }]]}
            onPress={() => {
              Haptics.selectionAsync()
              setActiveTab(tb.key)
              if (tb.key === 'izin' && leaves.length === 0 && !leavesLoading) loadLeaves()
            }}
          >
            <Text style={[s.tabTxt, activeTab === tb.key && { color: staff.color, fontWeight: '700' }]}>
              {tb.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 108 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={staff.color} />}
      >
        {/* ── Genel Tab ── */}
        {activeTab === 'genel' && (
          <View style={{ gap: 14 }}>
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('personel_contact')}</Text>
              {staff.email && <InfoRow icon="mail-outline" label={t('musteri_field_email')} value={staff.email} />}
              {staff.phone && <InfoRow icon="call-outline" label={t('musteri_field_phone')} value={staff.phone} />}
            </View>

            {staff.services.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>{t('personel_services_offered')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {staff.services.map(sv => (
                    <View key={sv.id} style={[s.svcChip, { backgroundColor: staff.color + '15', borderColor: staff.color + '40' }]}>
                      <Text style={[s.svcChipTxt, { color: staff.color }]}>{sv.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={s.card}>
              <Text style={s.cardTitle}>{t('personel_this_month_perf')}</Text>
              <View style={{ marginTop: 12, gap: 12 }}>
                <PerfRow label={t('personel_total_apt')} value={stats.count} max={40} color={staff.color} />
                <PerfRow label={t('personel_completed_apt')} value={stats.completedCount} max={stats.count || 1} color="#059669" />
                <PerfRow label={t('personel_completion_rate')} value={completionRate} max={100} color="#7C3AED" suffix="%" />
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>{t('personel_commission_calc')}</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 6 }}>{t('personel_commission_rate_label')}</Text>
                  <TextInput
                    style={[s.commInput, { borderColor: staff.color + '60' }]}
                    value={commissionRate}
                    onChangeText={setCommissionRate}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <TouchableOpacity style={[s.commSaveBtn, { backgroundColor: staff.color }]} onPress={handleSaveCommission} disabled={savingCommission}>
                  {savingCommission ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.commSaveTxt}>{t('save')}</Text>}
                </TouchableOpacity>
              </View>
              {parseFloat(commissionRate) > 0 && stats.revenue > 0 && (
                <View style={[s.commResult, { backgroundColor: staff.color + '10', borderColor: staff.color + '30' }]}>
                  <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>{t('personel_estimated_commission')}</Text>
                  <Text style={[s.commAmount, { color: staff.color }]}>
                    ₺{Math.round(stats.revenue * (parseFloat(commissionRate) / 100)).toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                    ₺{stats.revenue.toLocaleString()} × %{commissionRate}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>{t('personel_password_section')}</Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, marginBottom: 12 }}>{t('personel_password_section_sub')}</Text>
              <View style={s.passRow}>
                <TextInput
                  style={[s.commInput, { flex: 1, borderColor: '#E5E7EB' }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder={t('staff_password_placeholder')}
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showNewPass}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={s.passEye} onPress={() => setShowNewPass(v => !v)}>
                  <Ionicons name={showNewPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: staff.color, marginTop: 10 }]} onPress={handleSavePassword} disabled={savingPassword}>
                {savingPassword ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnTxt}>{t('personel_password_save_btn')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Randevular Tab ── */}
        {activeTab === 'randevular' && (
          <View style={{ gap: 8 }}>
            {recentApts.length === 0
              ? <Text style={s.empty}>{t('staff_noAppointments')}</Text>
              : recentApts.map(apt => (
                <View key={apt.id} style={s.aptRow}>
                  <View style={[s.aptDot, { backgroundColor: apt.service.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.aptCustomer}>{apt.customer.name}</Text>
                    <Text style={s.aptService}>{apt.service.name}</Text>
                    <Text style={s.aptDate}>
                      {new Date(apt.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {apt.startTime}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[apt.status] + '18' }]}>
                      <Text style={[s.statusTxt2, { color: STATUS_COLOR[apt.status] }]}>{t(STATUS_LABEL_KEYS[apt.status] ?? 'status_pending')}</Text>
                    </View>
                    <Text style={s.aptPrice}>₺{apt.price}</Text>
                  </View>
                </View>
              ))
            }
          </View>
        )}

        {/* ── Program Tab ── */}
        {activeTab === 'program' && (
          <View style={{ gap: 20 }}>
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('personel_weekly_schedule')}</Text>
              <View style={{ marginTop: 14, gap: 8 }}>
                {WORK_DAYS.map(({ label, day }) => {
                  const active = workDays.includes(day)
                  return (
                    <View key={day} style={s.shiftRow}>
                      <TouchableOpacity
                        style={[s.shiftDayBtn, active && { backgroundColor: staff.color + '20', borderColor: staff.color }]}
                        onPress={() => toggleDay(day)}
                      >
                        <View style={[s.shiftDayDot, { backgroundColor: active ? staff.color : '#E5E7EB' }]} />
                        <Text style={[s.shiftDayTxt, active && { color: staff.color, fontWeight: '700' }]}>{label}</Text>
                      </TouchableOpacity>
                      {active ? (
                        <View style={s.shiftBarWrap}>
                          <View style={[s.shiftBar, { backgroundColor: staff.color + '30' }]}>
                            <View style={[s.shiftFill, {
                              backgroundColor: staff.color,
                              left: `${((parseInt(startTime) - 7) / 14) * 100}%` as any,
                              right: `${((20 - parseInt(endTime)) / 14) * 100}%` as any,
                            }]} />
                          </View>
                          <Text style={[s.shiftHours, { color: staff.color }]}>{startTime}–{endTime}</Text>
                        </View>
                      ) : (
                        <View style={s.shiftBarWrap}>
                          <Text style={s.shiftOff}>{t('personel_closed')}</Text>
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>{t('personel_work_days')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {WORK_DAYS.map(({ label, day }) => {
                  const active = workDays.includes(day)
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[s.dayBtn, active && { backgroundColor: staff.color, borderColor: staff.color }]}
                      onPress={() => toggleDay(day)}
                    >
                      <Text style={[s.dayBtnTxt, active && { color: '#fff' }]}>{label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>{t('personel_work_hours')}</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.timeLabel}>{t('personel_start_time')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {WORK_HOURS.map(h => (
                        <TouchableOpacity
                          key={h}
                          style={[s.timeChip, startTime === h && { backgroundColor: staff.color, borderColor: staff.color }]}
                          onPress={() => { Haptics.selectionAsync(); setStartTime(h) }}
                        >
                          <Text style={[s.timeChipTxt, startTime === h && { color: '#fff' }]}>{h}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
              <View style={{ marginTop: 14 }}>
                <Text style={s.timeLabel}>{t('personel_end_time')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {WORK_HOURS.map(h => (
                      <TouchableOpacity
                        key={h}
                        style={[s.timeChip, endTime === h && { backgroundColor: staff.color, borderColor: staff.color }]}
                        onPress={() => { Haptics.selectionAsync(); setEndTime(h) }}
                      >
                        <Text style={[s.timeChipTxt, endTime === h && { color: '#fff' }]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>

            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: staff.color }]}
              onPress={handleSaveSchedule}
              disabled={savingSchedule}
            >
              {savingSchedule
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnTxt}>{t('save')}</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── İzin Tab ── */}
        {activeTab === 'izin' && (
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: staff.color, flexDirection: 'row', gap: 8, justifyContent: 'center' }]}
              onPress={() => setShowLeaveModal(true)}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.saveBtnTxt}>{t('personel_leave_add_btn')}</Text>
            </TouchableOpacity>

            {leavesLoading ? (
              <ActivityIndicator color={staff.color} style={{ marginTop: 24 }} />
            ) : leaves.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Ionicons name="calendar-clear-outline" size={48} color="#E5E7EB" />
                <Text style={s.empty}>{t('personel_no_leaves')}</Text>
              </View>
            ) : leaves.map(leave => (
              <LeaveRow key={leave.id} leave={leave} color={staff.color} onDelete={() => handleDeleteLeave(leave.id)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* İzin Ekleme Modal */}
      <Modal visible={showLeaveModal} animationType="slide" presentationStyle="formSheet">
        <View style={lm.modal}>
          <View style={lm.header}>
            <Text style={lm.title}>{t('personel_leave_add_btn')}</Text>
            <TouchableOpacity style={lm.closeBtn} onPress={() => setShowLeaveModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={lm.body} keyboardShouldPersistTaps="handled">
            <Text style={lm.label}>{t('personel_leave_type')}</Text>
            <View style={lm.typeRow}>
              {(['IZIN', 'TATIL', 'HASTALIK', 'DIGER'] as const).map(lt => (
                <TouchableOpacity
                  key={lt}
                  style={[lm.typeBtn, leaveForm.type === lt && { backgroundColor: staff.color, borderColor: staff.color }]}
                  onPress={() => setLeaveForm(f => ({ ...f, type: lt }))}
                >
                  <Text style={[lm.typeTxt, leaveForm.type === lt && { color: '#fff' }]}>
                    {lt === 'IZIN' ? t('personel_leave_annual') : lt === 'TATIL' ? t('personel_leave_holiday') : lt === 'HASTALIK' ? t('personel_leave_sick') : t('personel_leave_other_type')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[lm.label, { marginTop: 16 }]}>{t('personel_leave_start')}</Text>
            <TouchableOpacity style={lm.dateBtn} onPress={() => { setShowEndPicker(false); setShowStartPicker(v => !v) }}>
              <Ionicons name="calendar-outline" size={18} color="#7C3AED" />
              <Text style={[lm.dateTxt, !leaveForm.startDate && { color: '#9CA3AF' }]}>
                {leaveForm.startDate
                  ? new Date(leaveForm.startDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                  : t('personel_leave_select_date')}
              </Text>
              <Ionicons name={showStartPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            {showStartPicker && (
              <View style={lm.pickerWrap}>
                <DateTimePicker
                  value={leaveForm.startDate ? new Date(leaveForm.startDate + 'T12:00:00') : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'spinner'}
                  locale="tr-TR"
                  themeVariant="light"
                  accentColor="#7C3AED"
                  onChange={(_, date) => {
                    if (date) {
                      const iso = date.toISOString().split('T')[0]
                      setLeaveForm(f => ({ ...f, startDate: iso }))
                    }
                  }}
                />
              </View>
            )}

            <Text style={lm.label}>{t('personel_leave_end')}</Text>
            <TouchableOpacity style={lm.dateBtn} onPress={() => { setShowStartPicker(false); setShowEndPicker(v => !v) }}>
              <Ionicons name="calendar-outline" size={18} color="#7C3AED" />
              <Text style={[lm.dateTxt, !leaveForm.endDate && { color: '#9CA3AF' }]}>
                {leaveForm.endDate
                  ? new Date(leaveForm.endDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                  : t('personel_leave_select_date')}
              </Text>
              <Ionicons name={showEndPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            {showEndPicker && (
              <View style={lm.pickerWrap}>
                <DateTimePicker
                  value={leaveForm.endDate ? new Date(leaveForm.endDate + 'T12:00:00') : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'spinner'}
                  locale="tr-TR"
                  themeVariant="light"
                  accentColor="#7C3AED"
                  minimumDate={leaveForm.startDate ? new Date(leaveForm.startDate + 'T12:00:00') : undefined}
                  onChange={(_, date) => {
                    if (date) {
                      const iso = date.toISOString().split('T')[0]
                      setLeaveForm(f => ({ ...f, endDate: iso }))
                    }
                  }}
                />
              </View>
            )}

            <Text style={lm.label}>{t('personel_leave_reason')}</Text>
            <TextInput style={lm.input} value={leaveForm.reason} onChangeText={v => setLeaveForm(f => ({ ...f, reason: v }))} placeholder={t('personel_leave_optional')} placeholderTextColor="#9CA3AF" />

            <TouchableOpacity style={[lm.saveBtn, { backgroundColor: staff.color }]} onPress={handleSaveLeave} disabled={savingLeave}>
              {savingLeave ? <ActivityIndicator color="#fff" /> : <Text style={lm.saveTxt}>{t('save')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function LeaveRow({ leave, color, onDelete }: { leave: Leave; color: string; onDelete: () => void }) {
  const { t } = useTranslation()
  const lcolor = LEAVE_COLOR[leave.type] ?? '#6B7280'
  const lbg = LEAVE_BG[leave.type] ?? '#F3F4F6'
  const start = new Date(leave.startDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const end = new Date(leave.endDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const days = Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / 86400000) + 1
  return (
    <View style={lr.row}>
      <View style={[lr.typeBox, { backgroundColor: lbg }]}>
        <Text style={[lr.typeLabel, { color: lcolor }]}>{t(LEAVE_LABEL_KEYS[leave.type] ?? 'personel_leave_label_DIGER')}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={lr.dates}>{start} – {end}</Text>
        <Text style={lr.days}>{t('personel_days', { count: days })}</Text>
        {leave.reason ? <Text style={lr.reason}>{leave.reason}</Text> : null}
      </View>
      <TouchableOpacity onPress={onDelete} style={lr.delBtn}>
        <Ionicons name="trash-outline" size={16} color="#EF4444" />
      </TouchableOpacity>
    </View>
  )
}

const lr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  typeBox: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignSelf: 'flex-start' },
  typeLabel: { fontSize: 12, fontWeight: '700' },
  dates: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 2 },
  days: { fontSize: 12, color: '#6B7280' },
  reason: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  delBtn: { padding: 6 },
})

const lm = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1, padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  typeTxt: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 15, color: '#111827', marginBottom: 12 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, marginBottom: 4 },
  dateTxt: { fontSize: 15, color: '#111827', fontWeight: '500', flex: 1 },
  pickerWrap: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
})

function StatCard({ icon, label, value, sub, color }: { icon: IoniconsName; label: string; value: string; sub: string; color: string }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statSub}>{sub}</Text>
    </View>
  )
}

function InfoRow({ icon, label, value }: { icon: IoniconsName; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={15} color="#9CA3AF" />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  )
}

function PerfRow({ label, value, max, color, suffix = '' }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color }}>{value}{suffix}</Text>
      </View>
      <View style={s.perfTrack}>
        <View style={[s.perfFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  hero: { paddingBottom: 28, paddingHorizontal: 20, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.12)', top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -20, left: 20 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  statusToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)' },
  avatarTxt: { fontSize: 24, fontWeight: '900', color: '#fff' },
  heroName: { fontSize: 22, fontWeight: '900', color: '#fff' },
  heroTitle: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  heroMeta: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  heroCurve: { height: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  statLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: '900' },
  statSub: { fontSize: 10, color: '#9CA3AF', marginTop: 1 },

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', marginTop: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: {},
  tabTxt: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  infoLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', width: 70 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827' },

  svcChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  svcChipTxt: { fontSize: 12, fontWeight: '700' },

  perfTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  perfFill: { height: 6, borderRadius: 3 },

  aptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  aptDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  aptCustomer: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 1 },
  aptService: { fontSize: 12, color: '#7C3AED', fontWeight: '600', marginBottom: 2 },
  aptDate: { fontSize: 11, color: '#9CA3AF' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusTxt2: { fontSize: 10, fontWeight: '700' },
  aptPrice: { fontSize: 12, fontWeight: '700', color: '#059669' },

  dayBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  dayBtnTxt: { fontSize: 13, fontWeight: '700', color: '#374151' },
  timeLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  timeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  timeChipTxt: { fontSize: 13, fontWeight: '700', color: '#374151' },

  saveBtn: { padding: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },

  commInput: { backgroundColor: '#F9FAFB', borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 16, fontWeight: '700', color: '#111827' },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passEye: { width: 46, height: 46, backgroundColor: '#F3F4F6', borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  commSaveBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  commSaveTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  commResult: { marginTop: 14, borderRadius: 12, padding: 14, borderWidth: 1 },
  commAmount: { fontSize: 26, fontWeight: '900', marginTop: 4 },

  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 32, fontSize: 14 },

  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shiftDayBtn: { width: 52, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  shiftDayDot: { width: 6, height: 6, borderRadius: 3 },
  shiftDayTxt: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  shiftBarWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftBar: { flex: 1, height: 18, borderRadius: 9, overflow: 'hidden', position: 'relative' },
  shiftFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 9 },
  shiftHours: { fontSize: 11, fontWeight: '700', minWidth: 80 },
  shiftOff: { fontSize: 11, color: '#D1D5DB', fontWeight: '600' },
})
