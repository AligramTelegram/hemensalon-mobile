import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Switch, Linking,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, TenantProfile, WorkingHour, ReminderSettings } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { useTranslation } from 'react-i18next'
import { changeLanguage, LANGUAGE_OPTIONS } from '@/lib/i18n'

const CURRENCIES = [
  { code: 'TRY', symbol: '₺', labelKey: 'currency_try' },
  { code: 'USD', symbol: '$', labelKey: 'currency_usd' },
  { code: 'EUR', symbol: '€', labelKey: 'currency_eur' },
  { code: 'GBP', symbol: '£', labelKey: 'currency_gbp' },
]

const TIMEZONES = [
  { code: 'Europe/Istanbul', labelKey: 'tz_istanbul' },
  { code: 'Europe/London', labelKey: 'tz_london' },
  { code: 'Europe/Berlin', labelKey: 'tz_berlin' },
  { code: 'America/New_York', labelKey: 'tz_newyork' },
]

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']
type Tab = 'isletme' | 'calisma' | 'entegrasyon'

const PLAN_COLOR: Record<string, string> = { BASLANGIC: '#2563EB', PROFESYONEL: '#7C3AED', ISLETME: '#D97706' }

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
const HOURS = Array.from({ length: 29 }, (_, i) => {
  const h = Math.floor(i / 2) + 6
  const m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
})

const DEFAULT_HOURS: WorkingHour[] = [0, 1, 2, 3, 4, 5, 6].map(d => ({
  dayOfWeek: d,
  isOpen: d >= 1 && d <= 5,
  openTime: '09:00',
  closeTime: '18:00',
}))

export default function Ayarlar() {
  const { t } = useTranslation()
  const headerPad = useHeaderPad()
  const router = useRouter()
  useTheme() // ileride dark mode için
  const [profile, setProfile] = useState<TenantProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('isletme')

  // İşletme formu
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', sector: 'HAIR' })
  const [saving, setSaving] = useState(false)
  const [showSectorPicker, setShowSectorPicker] = useState(false)

  // Yerel tercihler
  const [currency, setCurrency] = useState('TRY')
  const [language, setLanguage] = useState('tr')
  const [timezone, setTimezone] = useState('Europe/Istanbul')

  // Hatırlatma ayarları
  const [remind24h, setRemind24h] = useState(true)
  const [remind2h, setRemind2h] = useState(true)
  const [savingReminders, setSavingReminders] = useState(false)

  // Çalışma saatleri
  const [hours, setHours] = useState<WorkingHour[]>(DEFAULT_HOURS)
  const [savingHours, setSavingHours] = useState(false)
  const [pickDay, setPickDay] = useState<number | null>(null)
  const [pickField, setPickField] = useState<'open' | 'close'>('open')
  const [showTimePicker, setShowTimePicker] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, wh, cur, lang, tz] = await Promise.all([
        api.tenant.get(),
        api.workingHours.list(),
        AsyncStorage.getItem('pref_currency'),
        AsyncStorage.getItem('pref_language'),
        AsyncStorage.getItem('pref_timezone'),
      ])
      setProfile(p)
      setForm({ name: p.name, phone: p.phone ?? '', email: p.email ?? '', address: p.address ?? '', sector: p.sector ?? 'HAIR' })
      if (wh.length > 0) setHours(wh)
      if (cur) setCurrency(cur)
      if (lang) setLanguage(lang)
      if (tz) setTimezone(tz)
      try {
        const rs = await api.reminders.getSettings()
        setRemind24h(rs.remind24h)
        setRemind2h(rs.remind2h)
      } catch {}
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSavePrefs() {
    try {
      await Promise.all([
        AsyncStorage.setItem('pref_currency', currency),
        AsyncStorage.setItem('pref_language', language),
        AsyncStorage.setItem('pref_timezone', timezone),
      ])
      await changeLanguage(language)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('success'), t('settings_saved'))
      Alert.alert(t('settings_languageChange'), t('settings_languageRestart'))
    } catch { Alert.alert(t('error'), t('settings_saveError')) }
  }

  async function handleSaveBusiness() {
    if (!form.name.trim()) { Alert.alert(t('warning'), t('auth_fillAll')); return }
    setSaving(true)
    try {
      const updated = await api.tenant.update({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        sector: form.sector,
      })
      setProfile(prev => prev ? { ...prev, ...updated } : prev)
      Alert.alert(t('success'), t('settings_saved'))
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_updateFailed')) }
    setSaving(false)
  }

  async function handleSaveHours() {
    setSavingHours(true)
    try {
      await api.workingHours.update(hours)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('success'), t('settings_saved'))
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_updateFailed')) }
    setSavingHours(false)
  }

  async function handleSaveReminders() {
    setSavingReminders(true)
    try {
      await api.reminders.updateSettings({ remind24h, remind2h })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('success'), t('settings_reminder_saved'))
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_updateFailed')) }
    setSavingReminders(false)
  }

  function toggleDay(dayOfWeek: number) {
    Haptics.selectionAsync()
    setHours(prev => prev.map(h => h.dayOfWeek === dayOfWeek ? { ...h, isOpen: !h.isOpen } : h))
  }

  function openTimePicker(dayOfWeek: number, field: 'open' | 'close') {
    Haptics.selectionAsync()
    setPickDay(dayOfWeek)
    setPickField(field)
    setShowTimePicker(true)
  }

  function selectTime(time: string) {
    if (pickDay === null) return
    setHours(prev => prev.map(h => {
      if (h.dayOfWeek !== pickDay) return h
      return pickField === 'open' ? { ...h, openTime: time } : { ...h, closeTime: time }
    }))
    setShowTimePicker(false)
  }

  const planColor = PLAN_COLOR[profile?.plan ?? 'BASLANGIC']

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#7C3AED" /></View>

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.heroTopRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={s.heroTitle}>{t('settings')}</Text>
        <Text style={s.heroSub}>{t('settings_business')}</Text>
      </View>
      <View style={s.heroCurve} />

      {/* Tab bar */}
      <View style={s.tabBar}>
        {([
          { key: 'isletme',    label: t('settings_business'),   icon: 'business-outline' },
          { key: 'calisma',    label: t('workingHours'),         icon: 'time-outline' },
          { key: 'entegrasyon',label: t('settings_about'),       icon: 'link-outline' },
        ] as { key: Tab; label: string; icon: IoniconsName }[]).map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, tab === t.key && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setTab(t.key) }}
          >
            <Ionicons name={t.icon} size={16} color={tab === t.key ? '#7C3AED' : '#9CA3AF'} />
            <Text style={[s.tabTxt, tab === t.key && s.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── İşletme Sekmesi ── */}
      {tab === 'isletme' && (
        <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
          <SectionCard title={t('settings_business')}>
            {/* Sektör seçici */}
            <Text style={s.fieldLabelSm}>{t('settings_sector')}</Text>
            <TouchableOpacity style={s.sectorBtn} onPress={() => { Haptics.selectionAsync(); setShowSectorPicker(v => !v) }}>
              <Ionicons name={SECTORS.find(sec => sec.key === form.sector)?.icon ?? 'cut-outline'} size={17} color="#7C3AED" />
              <Text style={s.sectorBtnTxt}>{t(`sector_${form.sector}`)}</Text>
              <Ionicons name={showSectorPicker ? 'chevron-up' : 'chevron-down'} size={15} color="#9CA3AF" />
            </TouchableOpacity>
            {showSectorPicker && (
              <View style={s.sectorDropdown}>
                {SECTORS.map(sec => (
                  <TouchableOpacity
                    key={sec.key}
                    style={[s.sectorOption, form.sector === sec.key && s.sectorOptionActive]}
                    onPress={() => { Haptics.selectionAsync(); setForm(f => ({ ...f, sector: sec.key })); setShowSectorPicker(false) }}
                  >
                    <Ionicons name={sec.icon} size={15} color={form.sector === sec.key ? '#7C3AED' : '#6B7280'} />
                    <Text style={[s.sectorOptionTxt, form.sector === sec.key && s.sectorOptionTxtActive]}>
                      {t(`sector_${sec.key}`)}
                    </Text>
                    {form.sector === sec.key && <Ionicons name="checkmark" size={14} color="#7C3AED" style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Field label={`${t('settings_businessName')} *`} value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('settings_salon_name_placeholder')} />
            <Field label={t('phone')} value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="05XX XXX XX XX" keyboardType="phone-pad" />
            <Field label={t('email')} value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="info@salon.com" keyboardType="email-address" />
            <Field label={t('address')} value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder={t('settings_address_placeholder')} multiline />

            {profile?.slug && (
              <View style={s.linkCard}>
                <Ionicons name="link-outline" size={14} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={s.linkLabel}>{t('settings_online_link')}</Text>
                  <Text style={s.linkValue}>hemensalon.com/r/{profile.slug}</Text>
                </View>
              </View>
            )}
          </SectionCard>

          {/* Plan özeti */}
          <SectionCard title={t('subscription')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={[s.planBadge, { backgroundColor: planColor + '15' }]}>
                <View style={[s.planDot, { backgroundColor: planColor }]} />
                <Text style={[s.planBadgeTxt, { color: planColor }]}>{t(`subscription_plan_${profile?.plan ?? 'BASLANGIC'}`)}</Text>
              </View>
              <TouchableOpacity style={s.upgradeLink} onPress={() => router.push('/abonelik' as never)}>
                <Text style={s.upgradeTxt}>{t('subscription_upgrade')} →</Text>
              </TouchableOpacity>
            </View>
            {profile?.planEndsAt && (
              <Text style={s.planEnds}>{t('subscription_planEnds', { date: new Date(profile.planEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) })}</Text>
            )}
            <View style={s.smsRow}>
              <Text style={s.smsLabel}>SMS {t('total')}</Text>
              <Text style={s.smsVal}>{profile?.smsUsed ?? 0} / {profile?.smsCredits ?? 0}</Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.min(((profile?.smsUsed ?? 0) / Math.max(profile?.smsCredits ?? 1, 1)) * 100, 100)}%` as any }]} />
            </View>
          </SectionCard>

          <TouchableOpacity style={s.saveBtn} onPress={handleSaveBusiness} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('save')}</Text>}
          </TouchableOpacity>

          {/* Tercihler */}
          <SectionCard title={t('settings')}>
            <Text style={s.prefLabel}>{t('currency')}</Text>
            <View style={s.prefRow}>
              {CURRENCIES.map(c => (
                <TouchableOpacity
                  key={c.code}
                  style={[s.prefChip, currency === c.code && s.prefChipActive]}
                  onPress={() => { Haptics.selectionAsync(); setCurrency(c.code) }}
                >
                  <Text style={[s.prefChipSym, currency === c.code && s.prefChipSymActive]}>{c.symbol}</Text>
                  <Text style={[s.prefChipTxt, currency === c.code && s.prefChipTxtActive]}>{c.code}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.prefLabel, { marginTop: 12 }]}>{t('language')}</Text>
            <View style={s.prefRow}>
              {LANGUAGE_OPTIONS.map(l => (
                <TouchableOpacity
                  key={l.code}
                  style={[s.prefChip, language === l.code && s.prefChipActive, { flex: 1 }]}
                  onPress={() => { Haptics.selectionAsync(); setLanguage(l.code) }}
                >
                  <Text style={[s.prefChipTxt, language === l.code && s.prefChipTxtActive]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.prefLabel, { marginTop: 12 }]}>{t('timezone')}</Text>
            {TIMEZONES.map(tz => (
              <TouchableOpacity
                key={tz.code}
                style={[s.tzRow, timezone === tz.code && s.tzRowActive]}
                onPress={() => { Haptics.selectionAsync(); setTimezone(tz.code) }}
              >
                <Ionicons name="globe-outline" size={14} color={timezone === tz.code ? '#7C3AED' : '#9CA3AF'} />
                <Text style={[s.tzTxt, timezone === tz.code && s.tzTxtActive]}>{t(tz.labelKey)}</Text>
                {timezone === tz.code && <Ionicons name="checkmark" size={16} color="#7C3AED" style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={[s.saveBtn, { marginTop: 16 }]} onPress={handleSavePrefs}>
              <Text style={s.saveTxt}>{t('settings_save_prefs')}</Text>
            </TouchableOpacity>
          </SectionCard>

          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* ── Çalışma Saatleri Sekmesi ── */}
      {tab === 'calisma' && (
        <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.sectionDesc}>{t('settings_hours_desc')}</Text>

          {hours.map(h => (
            <View key={h.dayOfWeek} style={[s.dayRow, !h.isOpen && s.dayRowClosed]}>
              <Switch
                value={h.isOpen}
                onValueChange={() => toggleDay(h.dayOfWeek)}
                trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
                thumbColor={h.isOpen ? '#7C3AED' : '#9CA3AF'}
              />
              <View style={s.dayNameWrap}>
                <Text style={[s.dayName, !h.isOpen && s.dayNameClosed]}>{t(`day_full_${h.dayOfWeek}`)}</Text>
                <Text style={[s.dayShort, !h.isOpen && s.dayNameClosed]}>{t(`day_short_${h.dayOfWeek}`)}</Text>
              </View>
              {h.isOpen ? (
                <View style={s.timeRow}>
                  <TouchableOpacity style={s.timeBtn} onPress={() => openTimePicker(h.dayOfWeek, 'open')}>
                    <Ionicons name="time-outline" size={13} color="#7C3AED" />
                    <Text style={s.timeTxt}>{h.openTime}</Text>
                  </TouchableOpacity>
                  <Text style={s.timeSep}>–</Text>
                  <TouchableOpacity style={s.timeBtn} onPress={() => openTimePicker(h.dayOfWeek, 'close')}>
                    <Ionicons name="time-outline" size={13} color="#7C3AED" />
                    <Text style={s.timeTxt}>{h.closeTime}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.closedBadge}>
                  <Text style={s.closedTxt}>{t('settings_closed')}</Text>
                </View>
              )}
            </View>
          ))}

          <TouchableOpacity style={[s.saveBtn, { marginTop: 8 }]} onPress={handleSaveHours} disabled={savingHours}>
            {savingHours ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('settings_save_hours')}</Text>}
          </TouchableOpacity>
          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* ── Entegrasyon Sekmesi ── */}
      {tab === 'entegrasyon' && (
        <ScrollView style={s.body}>
          <SectionCard title={t('settings_section_payment')}>
            <IntegrationRow
              icon="card-outline" color="#635BFF" title="Stripe"
              desc={t('settings_stripe_desc')}
              onPress={() => Linking.openURL('https://app.hemensalon.com/integrations/stripe')}
            />
          </SectionCard>

          <SectionCard title={t('settings_section_email')}>
            <IntegrationRow
              icon="mail-outline" color="#059669" title="Resend"
              desc={t('settings_email_desc')}
              onPress={() => Linking.openURL('https://app.hemensalon.com/integrations/email')}
            />
          </SectionCard>

          <SectionCard title={t('settings_section_calendar')}>
            <IntegrationRow
              icon="calendar-outline" color="#4285F4" title="Google Calendar"
              desc={t('settings_gcal_desc')}
              onPress={() => Linking.openURL('https://app.hemensalon.com/integrations/gcal')}
              badge={t('settings_soon_badge')}
            />
          </SectionCard>

          <SectionCard title={t('settings_section_notifications')}>
            <IntegrationRow
              icon="notifications-outline" color="#D97706" title={t('settings_push_notif')}
              desc={t('settings_notif_desc')}
              onPress={() => {}}
              badge={t('settings_notif_badge')}
              badgeColor="#059669"
            />
          </SectionCard>

          {/* Randevu Hatırlatmaları */}
          <SectionCard title={t('settings_reminders')}>
            <Text style={s.reminderDesc}>{t('settings_reminder_desc')}</Text>

            <View style={s.reminderRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.reminderLabel}>{t('settings_reminder_24h')}</Text>
                <Text style={s.reminderSub}>{t('settings_reminder_24h_desc')}</Text>
              </View>
              <Switch
                value={remind24h}
                onValueChange={v => { Haptics.selectionAsync(); setRemind24h(v) }}
                trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
                thumbColor={remind24h ? '#7C3AED' : '#9CA3AF'}
              />
            </View>

            <View style={[s.reminderRow, { marginTop: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.reminderLabel}>{t('settings_reminder_2h')}</Text>
                <Text style={s.reminderSub}>{t('settings_reminder_2h_desc')}</Text>
              </View>
              <Switch
                value={remind2h}
                onValueChange={v => { Haptics.selectionAsync(); setRemind2h(v) }}
                trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
                thumbColor={remind2h ? '#7C3AED' : '#9CA3AF'}
              />
            </View>

            <View style={s.reminderChannelBadge}>
              <Ionicons name="information-circle-outline" size={14} color="#2563EB" />
              <Text style={s.reminderChannelTxt}>{t('settings_reminder_channel')}</Text>
            </View>

            <TouchableOpacity style={[s.saveBtn, { marginTop: 14 }]} onPress={handleSaveReminders} disabled={savingReminders}>
              {savingReminders
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveTxt}>{t('settings_reminder_save')}</Text>
              }
            </TouchableOpacity>
          </SectionCard>

          <SectionCard title={t('settings_section_about')}>
            <View style={s.aboutRow}>
              <Text style={s.aboutLabel}>{t('settings_app_version')}</Text>
              <Text style={s.aboutVal}>1.0.0</Text>
            </View>
            <View style={s.aboutRow}>
              <Text style={s.aboutLabel}>Backend</Text>
              <Text style={s.aboutVal}>Supabase</Text>
            </View>
            <TouchableOpacity style={s.aboutRow} onPress={() => Linking.openURL('https://hemensalon.com/gizlilik')}>
              <Text style={s.aboutLabel}>{t('settings_privacy')}</Text>
              <Ionicons name="open-outline" size={14} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity style={s.aboutRow} onPress={() => Linking.openURL('https://hemensalon.com/kullanim')}>
              <Text style={s.aboutLabel}>{t('settings_terms')}</Text>
              <Ionicons name="open-outline" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </SectionCard>

          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* Saat seçici modal */}
      {showTimePicker && (
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>{pickField === 'open' ? t('settings_open_time') : t('settings_close_time')}</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {HOURS.map(t => {
                const current = pickDay !== null
                  ? (pickField === 'open' ? hours[pickDay]?.openTime : hours[pickDay]?.closeTime)
                  : null
                const active = current === t
                return (
                  <TouchableOpacity
                    key={t}
                    style={[s.pickerItem, active && s.pickerItemActive]}
                    onPress={() => selectTime(t)}
                  >
                    <Text style={[s.pickerItemTxt, active && s.pickerItemTxtActive]}>{t}</Text>
                    {active && <Ionicons name="checkmark" size={16} color="#7C3AED" />}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.sectionCard}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Field({ label, value, onChange, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; keyboardType?: any; multiline?: boolean
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 72, textAlignVertical: 'top' }]}
        value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType ?? 'default'} autoCapitalize="none" multiline={multiline}
      />
    </View>
  )
}

function IntegrationRow({ icon, color, title, desc, onPress, badge, badgeColor = '#6B7280' }: {
  icon: IoniconsName; color: string; title: string; desc: string; onPress: () => void; badge?: string; badgeColor?: string
}) {
  return (
    <TouchableOpacity style={s.integRow} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.integIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.integTitle}>{title}</Text>
          {badge && (
            <View style={[s.integBadge, { backgroundColor: badgeColor + '20' }]}>
              <Text style={[s.integBadgeTxt, { color: badgeColor }]}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={s.integDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  hero: { backgroundColor: '#7C3AED', paddingBottom: 24, paddingHorizontal: 20, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#6D28D9', opacity: 0.4, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  heroTopRow: { marginBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  heroCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, gap: 3, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#7C3AED' },
  tabTxt: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  tabTxtActive: { color: '#7C3AED', fontWeight: '700' },

  body: { flex: 1, padding: 16 },
  sectionDesc: { fontSize: 13, color: '#6B7280', marginBottom: 14 },

  sectionCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', padding: 13, borderRadius: 12, fontSize: 14, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB' },

  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, marginTop: 4 },
  linkLabel: { fontSize: 11, fontWeight: '700', color: '#7C3AED', marginBottom: 2 },
  linkValue: { fontSize: 13, color: '#374151', fontWeight: '600' },

  planBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  planDot: { width: 6, height: 6, borderRadius: 3 },
  planBadgeTxt: { fontSize: 13, fontWeight: '800' },
  upgradeLink: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#EDE9FE', borderRadius: 12 },
  upgradeTxt: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
  planEnds: { fontSize: 12, color: '#9CA3AF', marginTop: 8 },
  smsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 6 },
  smsLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  smsVal: { fontSize: 12, color: '#9CA3AF' },
  track: { height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3, backgroundColor: '#7C3AED' },

  saveBtn: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 14, alignItems: 'center' },
  saveTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Çalışma saatleri
  dayRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  dayRowClosed: { opacity: 0.6 },
  dayNameWrap: { flex: 1 },
  dayName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  dayShort: { fontSize: 11, color: '#9CA3AF' },
  dayNameClosed: { color: '#9CA3AF' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  timeTxt: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
  timeSep: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
  closedBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  closedTxt: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },

  // Entegrasyon
  integRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  integIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  integTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  integBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  integBadgeTxt: { fontSize: 10, fontWeight: '700' },
  integDesc: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  aboutLabel: { fontSize: 13, color: '#374151', fontWeight: '600' },
  aboutVal: { fontSize: 13, color: '#9CA3AF' },

  // Saat seçici
  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12 },
  pickerItemActive: { backgroundColor: '#EDE9FE' },
  pickerItemTxt: { fontSize: 16, fontWeight: '600', color: '#374151' },
  pickerItemTxtActive: { color: '#7C3AED', fontWeight: '800' },

  // Hatırlatmalar
  reminderDesc: { fontSize: 12, color: '#6B7280', lineHeight: 18, marginBottom: 14 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  reminderLabel: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  reminderSub: { fontSize: 12, color: '#9CA3AF' },
  reminderChannelBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', borderRadius: 10, padding: 10, marginTop: 12 },
  reminderChannelTxt: { flex: 1, fontSize: 11, color: '#1D4ED8', fontWeight: '600' },

  // Tercihler
  prefLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  prefRow: { flexDirection: 'row', gap: 8 },
  prefChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', gap: 2 },
  prefChipActive: { borderColor: '#7C3AED', backgroundColor: '#EDE9FE' },
  prefChipSym: { fontSize: 16, fontWeight: '900', color: '#6B7280' },
  prefChipSymActive: { color: '#7C3AED' },
  prefChipTxt: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  prefChipTxtActive: { color: '#7C3AED' },
  darkModeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  tzRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', marginBottom: 6 },
  tzRowActive: { borderColor: '#7C3AED', backgroundColor: '#EDE9FE' },
  tzTxt: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tzTxtActive: { color: '#7C3AED', fontWeight: '700' },
  fieldLabelSm: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 },
  sectorBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 12, marginBottom: 10 },
  sectorBtnTxt: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '600' },
  sectorDropdown: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  sectorOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  sectorOptionActive: { backgroundColor: '#F5F3FF' },
  sectorOptionTxt: { fontSize: 13, color: '#374151', fontWeight: '500' },
  sectorOptionTxtActive: { color: '#7C3AED', fontWeight: '700' },
})
