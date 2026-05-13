import { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, RefreshControl, ActivityIndicator, ScrollView, Platform } from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { api, Staff, PlanLimitError } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { usePlanFeatures } from '@/lib/usePlanFeatures'

const COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2', '#DB2777', '#EA580C']

export default function Calisanlar() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const planFeatures = usePlanFeatures()
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState({ name: '', title: '', email: '', phone: '', color: '#7C3AED', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setStaff(await api.staff.list()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', title: '', email: '', phone: '', color: '#7C3AED', password: '' })
    setShowPassword(false)
    setShowModal(true)
  }

  function openEdit(st: Staff) {
    setEditing(st)
    setForm({ name: st.name, title: st.title ?? '', email: st.email ?? '', phone: st.phone ?? '', color: st.color, password: '' })
    setShowModal(true)
  }

  function handleDelete(st: Staff) {
    Alert.alert(
      t('staff_delete_confirm_title'),
      t('staff_delete_confirm_msg', { name: st.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive', onPress: async () => {
            setDeleting(st.id)
            try {
              await api.staff.delete(st.id)
              setStaff(prev => prev.filter(s => s.id !== st.id))
            } catch {
              Alert.alert(t('error'), t('err_failed'))
            }
            setDeleting(null)
          }
        },
      ]
    )
  }

  async function handleSave() {
    if (!form.name) { Alert.alert(t('warning'), t('staff_nameRequired')); return }
    if (!editing && form.password.length < 6) { Alert.alert(t('warning'), t('staff_password_min')); return }
    if (editing && form.password && form.password.length < 6) { Alert.alert(t('warning'), t('staff_password_min')); return }
    setSaving(true)
    try {
      const body = { name: form.name, title: form.title || undefined, email: form.email || undefined, phone: form.phone || undefined, color: form.color, ...(form.password ? { password: form.password } : {}) }
      if (editing) {
        const updated = await api.staff.update(editing.id, body)
        setStaff(prev => prev.map(s => s.id === editing.id ? { ...s, ...updated } : s))
      } else {
        await api.staff.create(body)
        load()
      }
      setShowModal(false)
    } catch (e: unknown) {
      if (e instanceof PlanLimitError) {
        Alert.alert(
          t('staff_limit_alert_title'),
          e.message,
          [
            { text: t('ok'), style: 'cancel' },
            { text: t('plan_upgrade_btn'), style: 'default', onPress: () => { setShowModal(false); router.push('/abonelik' as never) } },
          ]
        )
      } else {
        Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed'))
      }
    }
    setSaving(false)
  }

  const q = search.toLowerCase()
  const activeStaff = staff.filter(st => st.isActive && st.name.toLowerCase().includes(q))
  const inactiveStaff = staff.filter(st => !st.isActive && st.name.toLowerCase().includes(q))
  const activeCount = staff.filter(st => st.isActive).length

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.addBtn, activeCount >= planFeatures.maxStaff && { backgroundColor: '#E5E7EB' }]}
            onPress={() => {
              if (activeCount >= planFeatures.maxStaff) {
                router.push('/abonelik' as never)
              } else {
                openCreate()
              }
            }}
          >
            {activeCount >= planFeatures.maxStaff
              ? <Ionicons name="lock-closed" size={14} color="#9CA3AF" />
              : <Ionicons name="add" size={16} color="#7C3AED" />
            }
            <Text style={[s.addTxt, activeCount >= planFeatures.maxStaff && { color: '#9CA3AF' }]}>
              {activeCount >= planFeatures.maxStaff ? t('menu_upgrade') : t('new')}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={s.headerTitle}>{t('staff_title')}</Text>
        <Text style={s.headerSub}>{t('staff_count', { count: activeCount })}</Text>
      </View>
      <View style={s.headerCurve} />

      {/* Plan limit uyarısı */}
      {!planFeatures.loading && activeCount >= planFeatures.maxStaff && (
        <TouchableOpacity style={s.limitBanner} onPress={() => router.push('/abonelik' as never)} activeOpacity={0.85}>
          <Ionicons name="lock-closed" size={16} color="#D97706" />
          <View style={{ flex: 1 }}>
            <Text style={s.limitBannerTitle}>{t('staff_limit_title', { current: activeCount, max: planFeatures.maxStaff })}</Text>
            <Text style={s.limitBannerSub}>{t('staff_limit_sub')}</Text>
          </View>
          <View style={s.limitBannerBadge}><Text style={s.limitBannerBadgeTxt}>{t('sub_upgrade_btn')}</Text></View>
        </TouchableOpacity>
      )}

      {/* Arama */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#9CA3AF" />
        <TextInput
          style={s.searchInput}
          placeholder={t('staff_searchPlaceholder')}
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={17} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? <View style={s.center}><ActivityIndicator color="#7C3AED" /></View> : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}
        >
          {activeStaff.length === 0 && inactiveStaff.length === 0 && (
            <Text style={s.empty}>{t('staff_empty')}</Text>
          )}
          {activeStaff.map(item => (
            <StaffCard key={item.id} item={item} onPress={() => router.push(`/personel/${item.id}` as never)} onEdit={() => openEdit(item)} onDelete={() => handleDelete(item)} deleting={deleting === item.id} />
          ))}
          {inactiveStaff.length > 0 && (
            <>
              <Text style={s.sectionLabel}>{t('staff_inactive_section')}</Text>
              {inactiveStaff.map(item => (
                <StaffCard key={item.id} item={item} inactive onPress={() => router.push(`/personel/${item.id}` as never)} onEdit={() => openEdit(item)} onDelete={() => handleDelete(item)} deleting={deleting === item.id} />
              ))}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? t('staff_edit') : t('staff_new')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <FField label={`${t('name')} *`} value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('staff_namePlaceholder')} />
            <FField label={t('title')} value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder={t('staff_titlePlaceholder')} />
            <FField label={t('email')} value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="ornek@mail.com" keyboardType="email-address" />
            <View style={{ marginBottom: 14 }}>
              <Text style={s.fieldLabel}>{editing ? t('staff_password_change_label') : t('staff_password_label')}</Text>
              <View style={s.pinRow}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={form.password}
                  onChangeText={v => setForm(f => ({ ...f, password: v }))}
                  placeholder={editing ? t('staff_password_change_placeholder') : t('staff_password_placeholder')}
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={s.pinEye} onPress={() => setShowPassword(v => !v)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </View>
            <FField label={t('phone')} value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="05XX XXX XX XX" keyboardType="phone-pad" />

            <Text style={s.fieldLabel}>{t('color')}</Text>
            <View style={s.colorGrid}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setForm(f => ({ ...f, color: c }))}
                  style={[s.colorDot, { backgroundColor: c }, form.color === c && s.colorDotActive]}>
                  {form.color === c && <Ionicons name="checkmark" size={18} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{editing ? t('update') : t('staff_add')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function StaffCard({ item, inactive, onPress, onEdit, onDelete, deleting }: { item: Staff; inactive?: boolean; onPress: () => void; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  const { t } = useTranslation()
  return (
    <TouchableOpacity style={[s.card, inactive && s.cardInactive]} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.avatar, { backgroundColor: inactive ? '#D1D5DB' : item.color }]}>
        <Text style={s.avatarTxt}>{item.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}</Text>
      </View>
      <View style={s.cardInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.cardName, inactive && { color: '#9CA3AF' }]}>{item.name}</Text>
          {inactive && <View style={s.inactiveBadge}><Text style={s.inactiveBadgeTxt}>{t('staff_inactive_badge')}</Text></View>}
        </View>
        {item.title && <Text style={s.cardTitle}>{item.title}</Text>}
        {!inactive && item.services.length > 0 && (
          <View style={s.serviceChips}>
            {item.services.slice(0, 3).map(sv => (
              <Text key={sv.id} style={s.svcChip}>{sv.name}</Text>
            ))}
            {item.services.length > 3 && <Text style={s.svcChip}>+{item.services.length - 3}</Text>}
          </View>
        )}
      </View>
      <View style={s.cardActions}>
        <TouchableOpacity style={s.cardActionBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}>
          <Ionicons name="create-outline" size={19} color="#7C3AED" />
        </TouchableOpacity>
        <TouchableOpacity style={[s.cardActionBtn, s.cardDeleteBtn]} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }} disabled={deleting}>
          {deleting
            ? <ActivityIndicator size="small" color="#DC2626" />
            : <Ionicons name="trash-outline" size={19} color="#DC2626" />
          }
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

function FField({ label, value, onChange, placeholder, keyboardType }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboardType?: any }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9CA3AF" keyboardType={keyboardType ?? 'default'} autoCapitalize="none" />
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#7C3AED', paddingBottom: 28, paddingHorizontal: 16, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  addTxt: { color: '#7C3AED', fontWeight: '700', fontSize: 13 },
  limitBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBEB', marginHorizontal: 12, marginTop: 8, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#FDE68A' },
  limitBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  limitBannerSub: { fontSize: 11, color: '#B45309', marginTop: 1 },
  limitBannerBadge: { backgroundColor: '#D97706', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  limitBannerBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', margin: 12, marginBottom: 4, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E5E7EB', height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 48, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1, gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: '800', color: '#fff' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardTitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  serviceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  svcChip: { fontSize: 11, color: '#7C3AED', backgroundColor: '#F5F3FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, fontWeight: '600' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cardInactive: { opacity: 0.6, backgroundColor: '#F9FAFB' },
  inactiveBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  inactiveBadgeTxt: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 16, marginBottom: 8, paddingHorizontal: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardActionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center' },
  cardDeleteBtn: { backgroundColor: '#FEF2F2' },
  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, padding: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB' },
  colorGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  colorDot: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  colorDotActive: { transform: [{ scale: 1.15 }] },
  saveBtn: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinEye: { width: 48, height: 48, backgroundColor: '#F3F4F6', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
})
