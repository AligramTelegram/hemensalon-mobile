import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, ActivityIndicator,
  ScrollView, Platform, Switch,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { usePreferences } from '@/lib/usePreferences'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, Package, Service } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { usePlanFeatures } from '@/lib/usePlanFeatures'
import UpgradeOverlay from '@/components/UpgradeOverlay'

export default function Paketler() {
  const { t } = useTranslation()
  const planFeatures = usePlanFeatures()
  const headerPad = useHeaderPad()
  const { currencySymbol } = usePreferences()
  const router = useRouter()
  const [packages, setPackages] = useState<Package[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Package | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    serviceId: '',
    sessions: '5',
    price: '',
    description: '',
    validDays: 90,
  })

  const VALID_DAYS_OPTIONS = [
    { label: t('packages_validity_days', { days: 30 }), value: 30 },
    { label: t('packages_validity_days', { days: 60 }), value: 60 },
    { label: t('packages_validity_days', { days: 90 }), value: 90 },
    { label: t('packages_validity_days', { days: 180 }), value: 180 },
    { label: t('packages_validity_days', { days: 365 }), value: 365 },
    { label: t('packages_unlimited'), value: 0 },
  ]

  const load = useCallback(async () => {
    try {
      const [pkgs, svcs] = await Promise.all([api.packages.list(), api.services.list()])
      setPackages(pkgs)
      setServices(svcs)
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditing(null)
    setForm({ name: '', serviceId: services[0]?.id ?? '', sessions: '5', price: '', description: '', validDays: 90 })
    setShowModal(true)
  }

  function openEdit(pkg: Package) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditing(pkg)
    setForm({
      name: pkg.name,
      serviceId: pkg.service.id,
      sessions: String(pkg.sessions),
      price: String(pkg.price),
      description: pkg.description ?? '',
      validDays: pkg.validDays ?? 0,
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert(t('warning'), t('packages_warn_name')); return }
    if (!form.serviceId) { Alert.alert(t('warning'), t('packages_warn_service')); return }
    if (!form.price) { Alert.alert(t('warning'), t('packages_warn_price')); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        serviceId: form.serviceId,
        sessions: parseInt(form.sessions) || 5,
        price: parseFloat(form.price),
        description: form.description.trim() || undefined,
        validDays: form.validDays > 0 ? form.validDays : undefined,
      }
      if (editing) {
        const updated = await api.packages.update(editing.id, payload)
        setPackages(prev => prev.map(p => p.id === editing.id ? { ...p, ...updated } : p))
      } else {
        await api.packages.create(payload)
        load()
      }
      setShowModal(false)
    } catch (e: unknown) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed'))
    }
    setSaving(false)
  }

  async function handleToggleActive(pkg: Package) {
    Haptics.selectionAsync()
    try {
      const updated = await api.packages.update(pkg.id, { isActive: !pkg.isActive })
      setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, ...updated } : p))
    } catch {
      Alert.alert(t('error'), t('packages_err_status'))
    }
  }

  async function handleDelete(pkg: Package) {
    Alert.alert(t('packages_delete_title'), t('confirm_delete', { name: pkg.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive', onPress: async () => {
          try {
            await api.packages.delete(pkg.id)
            setPackages(prev => prev.filter(p => p.id !== pkg.id))
          } catch {
            Alert.alert(t('error'), t('packages_err_delete'))
          }
        },
      },
    ])
  }

  const activeCount = packages.filter(p => p.isActive).length
  const totalSales = packages.reduce((sum, p) => sum + (p._count?.customerPackages ?? 0), 0)

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
          <TouchableOpacity style={s.addBtn} onPress={openCreate} disabled={services.length === 0}>
            <Ionicons name="add" size={16} color="#7C3AED" />
            <Text style={s.addBtnTxt}>{t('packages_new')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.heroTitle}>{t('packages_title')}</Text>
        <Text style={s.heroSub}>{t('packages_hero_sub', { active: activeCount, total: totalSales })}</Text>
      </View>
      <View style={s.heroCurve} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#7C3AED" size="large" /></View>
      ) : (
        <FlatList
          data={packages}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 108 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="gift-outline" size={48} color="#D1D5DB" />
              <Text style={s.emptyTitle}>{t('packages_empty_title')}</Text>
              <Text style={s.emptySub}>{t('packages_empty_sub')}</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={openCreate}>
                <Text style={s.emptyBtnTxt}>{t('packages_create_first')}</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const svc = item.service
            const perSession = item.sessions > 0 ? (item.price / item.sessions).toFixed(0) : '—'
            const salesCount = item._count?.customerPackages ?? 0
            return (
              <View style={[s.card, !item.isActive && s.cardInactive]}>
                <View style={[s.colorBar, { backgroundColor: svc.color ?? '#7C3AED' }]} />
                <View style={s.cardBody}>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={s.cardTitleRow}>
                        <Text style={[s.cardName, !item.isActive && s.textMuted]}>{item.name}</Text>
                        {!item.isActive && (
                          <View style={s.inactiveBadge}>
                            <Text style={s.inactiveTxt}>{t('packages_inactive_badge')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.cardSvc}>{svc.name}</Text>
                      {item.description ? <Text style={s.cardDesc}>{item.description}</Text> : null}
                    </View>
                    <View style={s.priceCol}>
                      <Text style={s.priceMain}>{currencySymbol}{item.price}</Text>
                      <Text style={s.priceSub}>{t('packages_per_session', { price: perSession })}</Text>
                    </View>
                  </View>

                  <View style={s.cardStats}>
                    <StatChip icon="repeat-outline" label={t('packages_sessions', { count: item.sessions })} />
                    <StatChip icon="time-outline" label={item.validDays ? t('packages_validity_days', { days: item.validDays }) : t('packages_unlimited')} />
                    <StatChip icon="people-outline" label={t('packages_sales', { count: salesCount })} color={salesCount > 0 ? '#7C3AED' : undefined} />
                  </View>

                  <View style={s.cardActions}>
                    <View style={s.switchRow}>
                      <Text style={s.switchLabel}>{t('packages_active_label')}</Text>
                      <Switch
                        value={item.isActive}
                        onValueChange={() => handleToggleActive(item)}
                        trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
                        thumbColor={item.isActive ? '#7C3AED' : '#9CA3AF'}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={s.editBtn} onPress={() => openEdit(item)}>
                        <Ionicons name="pencil-outline" size={14} color="#7C3AED" />
                        <Text style={s.editBtnTxt}>{t('edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item)}>
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            )
          }}
        />
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? t('packages_modal_edit') : t('packages_modal_new')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">

            <Field label={t('packages_field_name')} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder={t('packages_name_ph')} />

            <Text style={s.label}>{t('packages_field_service')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {services.map(svc => (
                  <TouchableOpacity
                    key={svc.id}
                    style={[s.chipBtn, form.serviceId === svc.id && { backgroundColor: svc.color + '22', borderColor: svc.color }]}
                    onPress={() => setForm(f => ({ ...f, serviceId: svc.id }))}
                  >
                    <View style={[s.chipDot, { backgroundColor: svc.color }]} />
                    <Text style={[s.chipTxt, form.serviceId === svc.id && { color: svc.color, fontWeight: '700' }]}>{svc.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label={t('packages_field_sessions')} value={form.sessions} onChangeText={v => setForm(f => ({ ...f, sessions: v }))} keyboardType="numeric" placeholder="5" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t('packages_field_price')} value={form.price} onChangeText={v => setForm(f => ({ ...f, price: v }))} keyboardType="numeric" placeholder="0" />
              </View>
            </View>

            <Text style={s.label}>{t('packages_field_validity')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {VALID_DAYS_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.chipBtn, form.validDays === opt.value && s.chipBtnActive]}
                    onPress={() => setForm(f => ({ ...f, validDays: opt.value }))}
                  >
                    <Text style={[s.chipTxt, form.validDays === opt.value && s.chipTxtActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Field
              label={t('packages_field_desc')}
              value={form.description}
              onChangeText={v => setForm(f => ({ ...f, description: v }))}
              placeholder={t('packages_desc_ph')}
              multiline
            />

            {form.name && form.price && (
              <View style={s.previewCard}>
                <Text style={s.previewTitle}>{t('packages_preview_label')}</Text>
                <Text style={s.previewName}>{form.name || '—'}</Text>
                <Text style={s.previewDetail}>
                  {t('packages_preview_detail', { sessions: form.sessions || '?', price: form.price || '0' })}
                  {parseInt(form.sessions) > 0 && parseFloat(form.price) > 0
                    ? ' ' + t('packages_preview_per', { per: (parseFloat(form.price) / parseInt(form.sessions)).toFixed(0) })
                    : ''}
                </Text>
                {form.validDays > 0 && <Text style={s.previewDetail}>{t('packages_preview_valid', { days: form.validDays })}</Text>}
              </View>
            )}

            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveTxt}>{editing ? t('update') : t('packages_save')}</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {!planFeatures.loading && !planFeatures.hasPackages && (
        <UpgradeOverlay
          requiredPlan={planFeatures.upgradeForPackages}
          icon="pricetags-outline"
          title={t('upgrade_packages_title')}
          description={t('upgrade_packages_desc')}
          features={[t('upgrade_packages_f1'), t('upgrade_packages_f2'), t('upgrade_packages_f3'), t('upgrade_packages_f4')]}
        />
      )}
    </View>
  )
}

function StatChip({ icon, label, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color?: string }) {
  return (
    <View style={s.statChip}>
      <Ionicons name={icon} size={12} color={color ?? '#6B7280'} />
      <Text style={[s.statChipTxt, color ? { color } : {}]}>{label}</Text>
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
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  hero: { backgroundColor: '#7C3AED', paddingBottom: 28, paddingHorizontal: 20, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#6D28D9', opacity: 0.5, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  heroCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnTxt: { color: '#7C3AED', fontWeight: '700', fontSize: 13 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 24 },
  emptyBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  emptyBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardInactive: { opacity: 0.6 },
  colorBar: { width: 5 },
  cardBody: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  cardName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  textMuted: { color: '#9CA3AF' },
  inactiveBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  inactiveTxt: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
  cardSvc: { fontSize: 12, color: '#7C3AED', fontWeight: '600', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#6B7280' },
  priceCol: { alignItems: 'flex-end', paddingLeft: 8 },
  priceMain: { fontSize: 20, fontWeight: '900', color: '#111827' },
  priceSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  cardStats: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F9FAFB', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statChipTxt: { fontSize: 11, fontWeight: '600', color: '#6B7280' },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { fontSize: 13, color: '#374151', fontWeight: '600' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDE9FE', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  editBtnTxt: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
  deleteBtn: { backgroundColor: '#FEF2F2', padding: 7, borderRadius: 10 },

  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12 },
  chipBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  chipBtnActive: { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipTxt: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  chipTxtActive: { color: '#7C3AED' },

  previewCard: { backgroundColor: '#EDE9FE', borderRadius: 14, padding: 16, marginBottom: 16 },
  previewTitle: { fontSize: 11, fontWeight: '700', color: '#7C3AED', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  previewName: { fontSize: 16, fontWeight: '800', color: '#4C1D95', marginBottom: 4 },
  previewDetail: { fontSize: 13, color: '#6D28D9' },

  saveBtn: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
