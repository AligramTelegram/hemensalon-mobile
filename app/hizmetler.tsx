import { useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, RefreshControl, ActivityIndicator, ScrollView, Platform, StyleProp, ViewStyle } from 'react-native'
import { SkeletonScreen } from '@/components/SkeletonBox'
import { useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useDockPad } from '@/lib/useDockPad'
import { usePreferences } from '@/lib/usePreferences'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, Service } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { useTenantId } from '@/lib/useTenantId'

const COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2', '#DB2777', '#EA580C']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function durationLabel(min: number, t: (k: string, o?: any) => string) {
  if (min < 60) return t('duration_min_short', { min })
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? t('duration_hm', { h, m }) : t('duration_h', { h })
}

export default function Hizmetler() {
  const { t } = useTranslation()
  const headerPad = useHeaderPad()
  const dockPad = useDockPad()
  const { currencySymbol } = usePreferences()
  const router = useRouter()
  const queryClient = useQueryClient()
  const tenantId = useTenantId()
  const [refreshing, setRefreshing] = useState(false)
  const { data: services = [], isLoading: loading, refetch } = useQuery({
    queryKey: queryKeys.services(tenantId),
    queryFn: () => api.services.list(),
    staleTime: 5 * 60 * 1000,
  })

  // Service modal
  const [showSvcModal, setShowSvcModal] = useState(false)
  const [editingSvc, setEditingSvc] = useState<Service | null>(null)
  const [svcForm, setSvcForm] = useState({ name: '', description: '', duration: '60', price: '', color: '#7C3AED' })
  const [savingSvc, setSavingSvc] = useState(false)


  // ── Service handlers ──────────────────────────────────────────────────────

  function openCreateSvc() {
    setEditingSvc(null)
    setSvcForm({ name: '', description: '', duration: '60', price: '', color: '#7C3AED' })
    setShowSvcModal(true)
  }

  function openEditSvc(sv: Service) {
    setEditingSvc(sv)
    setSvcForm({ name: sv.name, description: '', duration: String(sv.duration), price: String(sv.price), color: sv.color })
    setShowSvcModal(true)
  }

  async function handleSaveSvc() {
    if (!svcForm.name || !svcForm.price || !svcForm.duration) { Alert.alert(t('warning'), t('hizmet_nameRequired')); return }
    setSavingSvc(true)
    try {
      const body = { name: svcForm.name, description: svcForm.description || undefined, duration: parseInt(svcForm.duration), price: parseFloat(svcForm.price), color: svcForm.color }
      if (editingSvc) {
        const updated = await api.services.update(editingSvc.id, body)
        queryClient.invalidateQueries({ queryKey: queryKeys.services(tenantId) })
      } else {
        await api.services.create(body)
        queryClient.invalidateQueries({ queryKey: queryKeys.services(tenantId) })
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setShowSvcModal(false)
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed'))
    }
    setSavingSvc(false)
  }

  async function handleDeleteSvc(sv: Service) {
    Alert.alert(t('hizmet_deleteTitle'), t('confirm_delete', { name: sv.name }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        try { await api.services.delete(sv.id); queryClient.invalidateQueries({ queryKey: queryKeys.services(tenantId) }) }
        catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_deleteFailed')) }
      }},
    ])
  }

  async function toggleActiveSvc(sv: Service) {
    try {
      const updated = await api.services.update(sv.id, { isActive: !sv.isActive })
      queryClient.invalidateQueries({ queryKey: queryKeys.services(tenantId) })
    } catch {}
  }

  const onAdd = () => openCreateSvc()

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={onAdd}>
            <Ionicons name="add" size={16} color="#7C3AED" />
            <Text style={s.addTxt}>{t('new')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.headerTitle}>{t('hizmetler_title')}</Text>
        <Text style={s.headerSub}>{t('hizmetler_count', { count: services.length })}</Text>
      </View>
      <View style={s.headerCurve} />

      {loading ? <SkeletonScreen rows={6} /> : (
        <FlatList
          data={services}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, paddingBottom: dockPad }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false) }} tintColor="#7C3AED" />}
          ListEmptyComponent={<Text style={s.empty}>{t('hizmetler_empty')}</Text>}
          renderItem={({ item }) => (
            <View style={[s.card, !item.isActive && s.cardInactive]}>
              <View style={[s.colorStripe, { backgroundColor: item.color }]} />
              <View style={s.cardBody}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardName, !item.isActive && { color: '#9CA3AF' }]}>{item.name}</Text>
                    <View style={s.cardMeta}>
                      <View style={s.metaChipWrap}>
                        <Ionicons name="time-outline" size={12} color="#7C3AED" />
                        <Text style={s.metaChipTxt}>{durationLabel(item.duration, t)}</Text>
                      </View>
                      <View style={[s.metaChipWrap, { backgroundColor: '#ECFDF5' }]}>
                        <Text style={[s.metaChipTxt, { color: '#059669' }]}>{currencySymbol}{item.price.toLocaleString()}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.cardActions}>
                    <TouchableOpacity style={s.iconBtn} onPress={() => toggleActiveSvc(item)}>
                      <Ionicons name={item.isActive ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={item.isActive ? '#059669' : '#9CA3AF'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.iconBtn} onPress={() => openEditSvc(item)}>
                      <Ionicons name="pencil-outline" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.iconBtn} onPress={() => handleDeleteSvc(item)}>
                      <Ionicons name="trash-outline" size={20} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Hizmet Modal */}
      <Modal visible={showSvcModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingSvc ? t('hizmet_edit') : t('hizmet_new')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowSvcModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <FField label={`${t('name')} *`} value={svcForm.name} onChange={v => setSvcForm(f => ({ ...f, name: v }))} placeholder={t('hizmet_namePlaceholder')} />
            <FField label={t('description')} value={svcForm.description} onChange={v => setSvcForm(f => ({ ...f, description: v }))} placeholder={t('optional')} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><FField label={`${t('duration_min')} *`} value={svcForm.duration} onChange={v => setSvcForm(f => ({ ...f, duration: v }))} placeholder="60" keyboardType="numeric" /></View>
              <View style={{ flex: 1 }}><FField label={`${t('price')} (${currencySymbol}) *`} value={svcForm.price} onChange={v => setSvcForm(f => ({ ...f, price: v }))} placeholder="200" keyboardType="numeric" /></View>
            </View>
            <Text style={s.fieldLabel}>{t('color')}</Text>
            <View style={s.colorGrid}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setSvcForm(f => ({ ...f, color: c }))}
                  style={[s.colorDot, { backgroundColor: c }, svcForm.color === c && s.colorDotActive]}>
                  {svcForm.color === c && <Ionicons name="checkmark" size={18} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.saveBtn} onPress={handleSaveSvc} disabled={savingSvc}>
              {savingSvc ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{editingSvc ? t('update') : t('hizmet_add')}</Text>}
            </TouchableOpacity>
            <View style={{ height: dockPad }} />
          </ScrollView>
        </View>
      </Modal>

    </View>
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
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 48, fontSize: 14 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  cardInactive: { opacity: 0.6 },
  colorStripe: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaChipWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5F3FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  metaChipTxt: { fontSize: 12, fontWeight: '600', color: '#7C3AED' },
  cardActions: { flexDirection: 'row', gap: 2, marginLeft: 4 },
  iconBtn: { padding: 6 },
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
})
