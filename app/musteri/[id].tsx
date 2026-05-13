import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, Platform, RefreshControl,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, Customer, CustomerNote, CustomerPackage, Package } from '@/lib/api'
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function getTagKey(c: { totalVisits: number; totalSpent: number; lastVisitAt?: string }): { key: string; color: string } | null {
  const now = Date.now()
  const lastVisit = c.lastVisitAt ? new Date(c.lastVisitAt).getTime() : null
  const daysSince = lastVisit ? (now - lastVisit) / 86400000 : null
  if (c.totalVisits >= 10 || c.totalSpent >= 3000) return { key: 'musteri_tag_vip', color: '#D97706' }
  if (daysSince !== null && daysSince > 90) return { key: 'musteri_tag_lost', color: '#DC2626' }
  if (daysSince !== null && daysSince > 60) return { key: 'musteri_tag_risk', color: '#EA580C' }
  return null
}

export default function MusteriDetay() {
  const { t } = useTranslation()
  const headerPad = useHeaderPad()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerPackages, setCustomerPackages] = useState<CustomerPackage[]>([])
  const [availablePackages, setAvailablePackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [showEditModal, setShowEditModal] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', birthday: '' })
  const [saving, setSaving] = useState(false)
  const [sellPackageId, setSellPackageId] = useState('')

  const [customerNotes, setCustomerNotes] = useState<CustomerNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteForm, setNoteForm] = useState({ content: '', category: 'GENEL' as CustomerNote['category'] })
  const [savingNote, setSavingNote] = useState(false)

  const loadNotes = useCallback(async () => {
    if (!id) return
    setNotesLoading(true)
    try {
      const notes = await api.customerNotes.list(id)
      setCustomerNotes(notes)
    } catch {}
    setNotesLoading(false)
  }, [id])

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [c, pkgs, allPkgs] = await Promise.all([
        api.customers.get(id),
        api.customerPackages.list(id),
        api.packages.list(),
      ])
      setCustomer(c)
      setCustomerPackages(pkgs)
      setAvailablePackages(allPkgs.filter(p => p.isActive))
      setForm({ name: c.name, phone: c.phone, email: c.email ?? '', notes: c.notes ?? '', birthday: c.birthday ?? '' })
    } catch {
      Alert.alert(t('error'), t('musteri_load_failed')); router.back()
    }
    setLoading(false); setRefreshing(false)
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadNotes() }, [loadNotes])

  async function handleAddNote() {
    if (!noteForm.content.trim()) { Alert.alert(t('warning'), t('musteri_note_required')); return }
    setSavingNote(true)
    try {
      const n = await api.customerNotes.create(id!, { content: noteForm.content.trim(), category: noteForm.category })
      setCustomerNotes(prev => [n, ...prev])
      setShowNoteModal(false)
      setNoteForm({ content: '', category: 'GENEL' })
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed')) }
    setSavingNote(false)
  }

  async function handleDeleteNote(noteId: string) {
    Alert.alert(t('musteri_note_delete_title'), t('musteri_note_delete_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        try {
          await api.customerNotes.delete(id!, noteId)
          setCustomerNotes(prev => prev.filter(n => n.id !== noteId))
        } catch { Alert.alert(t('error'), t('err_failed')) }
      }},
    ])
  }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert(t('warning'), t('musteri_name_required')); return }
    setSaving(true)
    try {
      const updated = await api.customers.update(id!, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
        birthday: form.birthday.trim() || undefined,
      })
      setCustomer(prev => prev ? { ...prev, ...updated } : prev)
      setShowEditModal(false)
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed')) }
    setSaving(false)
  }

  async function handleSellPackage() {
    if (!sellPackageId) { Alert.alert(t('warning'), t('musteri_pkg_required')); return }
    setSaving(true)
    try {
      const newPkg = await api.customerPackages.sell(id!, sellPackageId)
      setCustomerPackages(prev => [newPkg, ...prev])
      setShowSellModal(false); setSellPackageId('')
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed')) }
    setSaving(false)
  }

  async function handleUseSession(cp: CustomerPackage) {
    if (cp.sessionsLeft <= 0) { Alert.alert(t('warning'), t('musteri_pkg_expired')); return }
    Alert.alert(t('musteri_use_session'), t('musteri_use_session_confirm', { name: cp.package.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('yes'), onPress: async () => {
          try {
            const updated = await api.customerPackages.useSession(cp.id)
            setCustomerPackages(prev => prev.map(p => p.id === cp.id ? { ...p, ...updated } : p))
          } catch { Alert.alert(t('error'), t('err_failed')) }
        },
      },
    ])
  }

  async function handleDelete() {
    Alert.alert(t('musteri_delete_title'), t('musteri_delete_confirm', { name: customer?.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive', onPress: async () => {
          try { await api.customers.delete(id!); router.back() }
          catch { Alert.alert(t('error'), t('err_failed')) }
        },
      },
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#7C3AED" /></View>
  if (!customer) return null

  const tagData = getTagKey(customer)
  const tagLabel = tagData ? t(tagData.key) : null
  const activePackages = customerPackages.filter(p => p.isActive && p.sessionsLeft > 0)
  const pastPackages = customerPackages.filter(p => !p.isActive || p.sessionsLeft === 0)

  const NOTE_CATS: { key: CustomerNote['category']; label: string; catLabel: string; color: string; bg: string }[] = [
    { key: 'GENEL',  label: t('musteri_note_cat_genel'),  catLabel: t('musteri_note_cat_label_genel'),  color: '#6B7280', bg: '#F3F4F6' },
    { key: 'ALERJI', label: t('musteri_note_cat_alerji'), catLabel: t('musteri_note_cat_label_alerji'), color: '#DC2626', bg: '#FEF2F2' },
    { key: 'TERCIH', label: t('musteri_note_cat_tercih'), catLabel: t('musteri_note_cat_label_tercih'), color: '#D97706', bg: '#FFFBEB' },
    { key: 'OZEL',   label: t('musteri_note_cat_ozel'),   catLabel: t('musteri_note_cat_label_ozel'),   color: '#7C3AED', bg: '#F5F3FF' },
  ]

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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.iconBtn} onPress={() => { Haptics.selectionAsync(); setShowEditModal(true) }}>
              <Ionicons name="pencil-outline" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={16} color="#fca5a5" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{customer.name.charAt(0).toUpperCase()}</Text>
          </View>
          {tagData && tagLabel && (
            <View style={[s.tagBadge, { backgroundColor: tagData.color }]}>
              <Text style={s.tagBadgeTxt}>{tagLabel}</Text>
            </View>
          )}
        </View>
        <Text style={s.heroName}>{customer.name}</Text>
        <Text style={s.heroPhone}>{customer.phone}</Text>
      </View>
      <View style={s.heroCurve} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 108 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}
      >
        {/* İstatistikler */}
        <View style={s.statsRow}>
          <StatCard icon="calendar-outline" label={t('customer_visits')} value={String(customer.totalVisits)} color="#7C3AED" />
          <StatCard icon="wallet-outline" label={t('customer_spent')} value={`₺${customer.totalSpent}`} color="#059669" />
          <StatCard
            icon="time-outline" label={t('customer_lastVisit')}
            value={customer.lastVisitAt ? formatDate(customer.lastVisitAt) : '—'}
            color="#D97706"
          />
        </View>

        {/* İletişim bilgileri */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('musteri_contact')}</Text>
          <View style={s.infoCard}>
            <InfoRow icon="call-outline" label={t('musteri_field_phone')} value={customer.phone} />
            {customer.email && <InfoRow icon="mail-outline" label={t('musteri_field_email')} value={customer.email} />}
            {customer.birthday && <InfoRow icon="gift-outline" label={t('musteri_field_birthday')} value={customer.birthday} />}
            {customer.notes && <InfoRow icon="document-text-outline" label={t('musteri_field_notes')} value={customer.notes} />}
          </View>
        </View>

        {/* Notlar */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t('musteri_notes_title')}</Text>
            <TouchableOpacity
              style={s.sellBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowNoteModal(true) }}
            >
              <Ionicons name="add" size={14} color="#7C3AED" />
              <Text style={s.sellBtnTxt}>{t('musteri_add_note')}</Text>
            </TouchableOpacity>
          </View>
          {notesLoading ? (
            <ActivityIndicator color="#7C3AED" style={{ marginVertical: 12 }} />
          ) : customerNotes.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="document-text-outline" size={28} color="#D1D5DB" />
              <Text style={s.emptyTxt}>{t('musteri_no_notes')}</Text>
            </View>
          ) : (
            customerNotes.map(note => (
              <NoteRow key={note.id} note={note} noteCats={NOTE_CATS} onDelete={() => handleDeleteNote(note.id)} />
            ))
          )}
        </View>

        {/* Paketler */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t('musteri_pkgs_title')}</Text>
            <TouchableOpacity
              style={s.sellBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSellPackageId(availablePackages[0]?.id ?? ''); setShowSellModal(true) }}
              disabled={availablePackages.length === 0}
            >
              <Ionicons name="add" size={14} color="#7C3AED" />
              <Text style={s.sellBtnTxt}>{t('musteri_sell_pkg')}</Text>
            </TouchableOpacity>
          </View>

          {activePackages.length === 0 && pastPackages.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="gift-outline" size={32} color="#D1D5DB" />
              <Text style={s.emptyTxt}>{t('musteri_no_packages')}</Text>
            </View>
          ) : (
            <>
              {activePackages.map(cp => <PackageCard key={cp.id} cp={cp} onUse={() => handleUseSession(cp)} useLabel={t('musteri_use_session')} expiredLabel={t('musteri_pkg_expired')} unlimitedLabel={t('musteri_pkg_unlimited')} validUntilFn={(d) => t('musteri_pkg_valid_until', { date: d })} />)}
              {pastPackages.length > 0 && (
                <>
                  <Text style={s.subLabel}>{t('musteri_past_packages')}</Text>
                  {pastPackages.map(cp => <PackageCard key={cp.id} cp={cp} past expiredLabel={t('musteri_pkg_expired')} unlimitedLabel={t('musteri_pkg_unlimited')} validUntilFn={(d) => t('musteri_pkg_valid_until', { date: d })} />)}
                </>
              )}
            </>
          )}
        </View>

        {/* Randevu oluştur */}
        <View style={s.section}>
          <TouchableOpacity
            style={s.newAptBtn}
            onPress={() => router.push(`/randevu/yeni?customerId=${customer.id}` as never)}
          >
            <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
            <Text style={s.newAptBtnTxt}>{t('musteri_new_apt')}</Text>
          </TouchableOpacity>
        </View>

        {customer.appointments && customer.appointments.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t('musteri_apt_history')}</Text>
            {customer.appointments.slice(0, 20).map(a => (
              <View key={a.id} style={s.aptRow}>
                <View style={[s.aptDot, { backgroundColor: a.service.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.aptService}>{a.service.name}</Text>
                  <Text style={s.aptDate}>{formatDate(a.date)} · {a.startTime}–{a.endTime}{a.staff ? ` · ${a.staff.name}` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[s.statusBadge, { backgroundColor: (STATUS_COLOR[a.status] ?? '#6B7280') + '20' }]}>
                    <Text style={[s.statusTxt, { color: STATUS_COLOR[a.status] ?? '#6B7280' }]}>{t(STATUS_LABEL_KEYS[a.status] ?? 'status_pending')}</Text>
                  </View>
                  <Text style={s.aptPrice}>₺{a.price}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Düzenle Modal */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{t('musteri_edit_title')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowEditModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Field label={t('musteri_field_name')} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />
            <Field label={t('musteri_field_phone')} value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />
            <Field label={t('musteri_field_email')} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} keyboardType="email-address" />
            <Field label={t('musteri_field_birthday')} value={form.birthday} onChangeText={v => setForm(f => ({ ...f, birthday: v }))} placeholder="1990-05-15" />
            <Field label={t('musteri_field_notes')} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline placeholder={t('musteri_note_placeholder')} />
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('update')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Not Ekle Modal */}
      <Modal visible={showNoteModal} animationType="slide" presentationStyle="formSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{t('musteri_add_note')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowNoteModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>{t('musteri_note_cat')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {NOTE_CATS.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[s.catBtn, noteForm.category === cat.key && { backgroundColor: cat.color + '20', borderColor: cat.color }]}
                  onPress={() => { Haptics.selectionAsync(); setNoteForm(f => ({ ...f, category: cat.key })) }}
                >
                  <Text style={[s.catBtnTxt, noteForm.category === cat.key && { color: cat.color }]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>{t('musteri_note_label')}</Text>
            <TextInput
              style={[s.input, { height: 100, textAlignVertical: 'top' }]}
              value={noteForm.content}
              onChangeText={v => setNoteForm(f => ({ ...f, content: v }))}
              placeholder={t('musteri_note_placeholder')}
              placeholderTextColor="#9CA3AF"
              multiline
            />
            <TouchableOpacity style={s.saveBtn} onPress={handleAddNote} disabled={savingNote}>
              {savingNote ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('musteri_save_note')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Paket Sat Modal */}
      <Modal visible={showSellModal} animationType="slide" presentationStyle="formSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{t('musteri_sell_pkg')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowSellModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>{t('musteri_select_pkg')}</Text>
            {availablePackages.map(pkg => (
              <TouchableOpacity
                key={pkg.id}
                style={[s.pkgOption, sellPackageId === pkg.id && s.pkgOptionActive]}
                onPress={() => setSellPackageId(pkg.id)}
              >
                <View style={[s.pkgDot, { backgroundColor: pkg.service.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.pkgOptionName}>{pkg.name}</Text>
                  <Text style={s.pkgOptionSub}>{pkg.service.name} · {t('hizmet_sessions', { count: pkg.sessions })}</Text>
                </View>
                <Text style={s.pkgOptionPrice}>₺{pkg.price}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.saveBtn, { marginTop: 20 }]} onPress={handleSellPackage} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('musteri_complete_sale')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

type NoteCatItem = { key: CustomerNote['category']; label: string; catLabel: string; color: string; bg: string }

function NoteRow({ note, noteCats, onDelete }: { note: CustomerNote; noteCats: NoteCatItem[]; onDelete: () => void }) {
  const cat = noteCats.find(c => c.key === note.category) ?? noteCats[0]
  return (
    <View style={nr.card}>
      <View style={[nr.catBar, { backgroundColor: cat.color }]} />
      <View style={nr.body}>
        <View style={nr.top}>
          <View style={[nr.badge, { backgroundColor: cat.bg }]}>
            <Text style={[nr.badgeTxt, { color: cat.color }]}>{cat.catLabel}</Text>
          </View>
          <Text style={nr.date}>{new Date(note.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          <TouchableOpacity onPress={onDelete} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={14} color="#DC2626" />
          </TouchableOpacity>
        </View>
        <Text style={nr.content}>{note.content}</Text>
      </View>
    </View>
  )
}

function PackageCard({ cp, onUse, past, useLabel, expiredLabel, unlimitedLabel, validUntilFn }: {
  cp: CustomerPackage; onUse?: () => void; past?: boolean
  useLabel?: string; expiredLabel: string; unlimitedLabel: string; validUntilFn: (d: string) => string
}) {
  const pct = cp.sessionsTotal > 0 ? ((cp.sessionsTotal - cp.sessionsLeft) / cp.sessionsTotal) * 100 : 100
  const color = cp.package.service.color
  const expiresAt = cp.expiresAt ? new Date(cp.expiresAt) : null
  const expired = expiresAt ? expiresAt < new Date() : false

  return (
    <View style={[pc.card, past && pc.cardPast]}>
      <View style={[pc.colorBar, { backgroundColor: color }]} />
      <View style={pc.body}>
        <View style={pc.top}>
          <View style={{ flex: 1 }}>
            <Text style={pc.name}>{cp.package.name}</Text>
            <Text style={pc.svc}>{cp.package.service.name}</Text>
          </View>
          <View style={pc.countWrap}>
            <Text style={[pc.countNum, { color }]}>{cp.sessionsLeft}</Text>
            <Text style={pc.countSub}>/{cp.sessionsTotal}</Text>
          </View>
        </View>
        <View style={pc.track}>
          <View style={[pc.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
        </View>
        <View style={pc.bottom}>
          <Text style={pc.date}>
            {expiresAt
              ? (expired ? expiredLabel : validUntilFn(formatDate(expiresAt.toISOString())))
              : unlimitedLabel}
          </Text>
          {!past && onUse && useLabel && (
            <TouchableOpacity style={[pc.useBtn, { borderColor: color }]} onPress={onUse}>
              <Text style={[pc.useTxt, { color }]}>{useLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

function StatCard({ icon, label, value, color }: { icon: IoniconsName; label: string; value: string; color: string }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function InfoRow({ icon, label, value }: { icon: IoniconsName; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={15} color="#9CA3AF" />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChangeText: (v: string) => void
  placeholder?: string; keyboardType?: any; multiline?: boolean
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType} multiline={multiline}
      />
    </View>
  )
}

const nr = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' },
  catBar: { width: 4 },
  body: { flex: 1, padding: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  date: { flex: 1, fontSize: 11, color: '#9CA3AF' },
  content: { fontSize: 13, color: '#374151', lineHeight: 18 },
})

const pc = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' },
  cardPast: { opacity: 0.5 },
  colorBar: { width: 4 },
  body: { flex: 1, padding: 12 },
  top: { flexDirection: 'row', marginBottom: 10 },
  name: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  svc: { fontSize: 12, color: '#9CA3AF' },
  countWrap: { flexDirection: 'row', alignItems: 'baseline' },
  countNum: { fontSize: 24, fontWeight: '900' },
  countSub: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  track: { height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  fill: { height: 5, borderRadius: 3 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 11, color: '#9CA3AF' },
  useBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  useTxt: { fontSize: 11, fontWeight: '700' },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  hero: { backgroundColor: '#7C3AED', paddingBottom: 32, paddingHorizontal: 20, overflow: 'hidden', alignItems: 'center' },
  decoCircle1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: '#6D28D9', opacity: 0.5, top: -80, right: -60 },
  decoCircle2: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: '#fff', opacity: 0.05, bottom: -10, left: 20 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 20 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)' },
  avatarTxt: { fontSize: 30, fontWeight: '900', color: '#fff' },
  tagBadge: { position: 'absolute', bottom: -4, right: -4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 2, borderColor: '#7C3AED' },
  tagBadgeTxt: { fontSize: 9, fontWeight: '900', color: '#fff' },
  heroName: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroPhone: { fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  heroCurve: { height: 24, backgroundColor: '#7C3AED', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  statIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue: { fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 2 },
  statLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },

  section: { marginHorizontal: 16, marginTop: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  subLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },

  infoCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  infoLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', width: 80 },
  infoValue: { flex: 1, fontSize: 13, color: '#111827', fontWeight: '500' },

  sellBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDE9FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  sellBtnTxt: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },

  emptyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 28, alignItems: 'center', gap: 8 },
  emptyTxt: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },

  aptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  aptDot: { width: 10, height: 10, borderRadius: 5 },
  aptService: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 3 },
  aptDate: { fontSize: 11, color: '#9CA3AF' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusTxt: { fontSize: 10, fontWeight: '700' },
  aptPrice: { fontSize: 12, fontWeight: '700', color: '#059669' },

  pkgOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#E5E7EB' },
  pkgOptionActive: { borderColor: '#7C3AED', backgroundColor: '#FAFAFE' },
  pkgDot: { width: 10, height: 10, borderRadius: 5 },
  pkgOptionName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  pkgOptionSub: { fontSize: 12, color: '#9CA3AF' },
  pkgOptionPrice: { fontSize: 16, fontWeight: '900', color: '#111827' },

  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12 },
  newAptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#BFDBFE' },
  newAptBtnTxt: { fontSize: 14, fontWeight: '700', color: '#2563EB' },
  saveBtn: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  catBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  catBtnTxt: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
})
