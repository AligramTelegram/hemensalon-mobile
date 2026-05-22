import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, ActivityIndicator,
  ScrollView, Platform, Image,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { api, Customer, PlanLimitError } from '@/lib/api'
import { SkeletonScreen } from '@/components/SkeletonBox'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { useTenantId } from '@/lib/useTenantId'
import { useTranslation } from 'react-i18next'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'

type SortKey = 'name' | 'totalVisits' | 'totalSpent' | 'lastVisitAt'
type SegmentKey = 'ALL' | 'VIP' | 'YENI' | 'KAYIP' | 'RISK'

const STATUS_COLOR: Record<string, string> = { BEKLIYOR: '#D97706', ONAYLANDI: '#2563EB', TAMAMLANDI: '#059669', IPTAL: '#DC2626', GELMEDI: '#6B7280' }

function getTag(c: { totalVisits: number; totalSpent: number; lastVisitAt?: string; createdAt?: string }): { key: string; color: string; bg: string } | null {
  const now = Date.now()
  const lastVisit = c.lastVisitAt ? new Date(c.lastVisitAt).getTime() : null
  const daysSince = lastVisit ? (now - lastVisit) / 86400000 : null
  const createdDays = c.createdAt ? (now - new Date(c.createdAt).getTime()) / 86400000 : 999
  if (c.totalVisits >= 10 || c.totalSpent >= 3000) return { key: 'VIP', color: '#D97706', bg: '#FEF3C7' }
  if (createdDays <= 30 && c.totalVisits <= 2) return { key: 'YENI', color: '#2563EB', bg: '#EFF6FF' }
  if (daysSince !== null && daysSince > 90) return { key: 'KAYIP', color: '#DC2626', bg: '#FEF2F2' }
  if (daysSince !== null && daysSince > 60) return { key: 'RISK', color: '#EA580C', bg: '#FFF7ED' }
  return null
}

export default function Customers() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const queryClient = useQueryClient()
  const tenantId = useTenantId()
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [segment, setSegment] = useState<SegmentKey>('ALL')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', birthday: '' })
  const [saving, setSaving] = useState(false)
  const [photoUris, setPhotoUris] = useState<Record<string, string>>({})
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)

  const debouncedSearch = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    if (debouncedSearch.current) clearTimeout(debouncedSearch.current)
    debouncedSearch.current = setTimeout(() => setDebouncedQ(search.trim()), 300)
    return () => { if (debouncedSearch.current) clearTimeout(debouncedSearch.current) }
  }, [search])

  const {
    data: customerPages,
    isLoading: loading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchCustomers,
  } = useInfiniteQuery({
    queryKey: [...queryKeys.customers(tenantId), debouncedQ],
    queryFn: ({ pageParam = 1 }) => api.customers.list({ q: debouncedQ || undefined, page: pageParam, limit: 50 }),
    getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 2 * 60 * 1000,
    enabled: !!tenantId,
  })

  const customers = useMemo(() => customerPages?.pages.flatMap(p => p.data) ?? [], [customerPages])

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) return
      queryClient.invalidateQueries({ queryKey: queryKeys.customers(tenantId) })
    }, [tenantId, queryClient])
  )

  useEffect(() => {
    AsyncStorage.getItem('customer_photos').then(raw => {
      if (raw) setPhotoUris(JSON.parse(raw))
    }).catch(() => {})
  }, [])

  // Arama backend'de yapılıyor — customers zaten filtrelenmiş geliyor
  const searched = customers

  const segmented = segment === 'ALL' ? searched : searched.filter(c => {
    const tag = getTag(c)
    return tag?.key === segment
  })

  const sorted = [...segmented].sort((a, b) => {
    let va: string | number = a[sortKey] ?? ''
    let vb: string | number = b[sortKey] ?? ''
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    return sortAsc ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  function openDetail(c: Customer) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.push(`/musteri/${c.id}` as never)
  }

  function openCreate() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditing(null)
    setPendingPhoto(null)
    setForm({ name: '', phone: '', email: '', notes: '', birthday: '' })
    setShowModal(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setPendingPhoto(photoUris[c.id] ?? null)
    const bd = c.birthday ? new Date(c.birthday).toISOString().split('T')[0] : ''
    setForm({ name: c.name, phone: c.phone, email: c.email ?? '', notes: c.notes ?? '', birthday: bd })
    setShowModal(true)
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert(t('permissionRequired'), t('customer_photoPermission')); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })
    if (!result.canceled && result.assets[0]) {
      setPendingPhoto(result.assets[0].uri)
    }
  }

  async function savePhoto(customerId: string, uri: string | null) {
    const updated = { ...photoUris }
    if (uri) updated[customerId] = uri
    else delete updated[customerId]
    setPhotoUris(updated)
    await AsyncStorage.setItem('customer_photos', JSON.stringify(updated))
  }

  async function handleSave() {
    if (!form.name || !form.phone) { Alert.alert(t('warning'), t('customer_namePhoneRequired')); return }
    setSaving(true)
    const payload = {
      name: form.name, phone: form.phone,
      email: form.email || undefined, notes: form.notes || undefined,
      birthday: form.birthday || undefined,
    }
    try {
      if (editing) {
        const updated = await api.customers.update(editing.id, payload)
        queryClient.invalidateQueries({ queryKey: queryKeys.customers(tenantId) })
        await savePhoto(editing.id, pendingPhoto)
      } else {
        const created = await api.customers.create(payload)
        if (pendingPhoto) await savePhoto(created.id, pendingPhoto)
        queryClient.invalidateQueries({ queryKey: queryKeys.customers(tenantId) })
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setShowModal(false)
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (e instanceof PlanLimitError) {
        Alert.alert(
          t('customer_limit_title'),
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

  async function handleExportCSV() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      const header = `${t('name')},${t('phone')},${t('email')},${t('customer_visits')},${t('customer_spent')},${t('customer_lastVisit')},${t('birthday')}\n`
      const rows = customers.map(c => [
        `"${c.name}"`,
        `"${c.phone}"`,
        `"${c.email ?? ''}"`,
        c.totalVisits,
        c.totalSpent,
        c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString(undefined) : '',
        c.birthday ? new Date(c.birthday).toLocaleDateString(undefined) : '',
      ].join(',')).join('\n')
      const csv = header + rows
      const path = `${FileSystem.cacheDirectory}musteriler_${Date.now()}.csv`
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 })
      const canShare = await Sharing.isAvailableAsync()
      if (canShare) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: t('customer_exportTitle') })
      } else {
        Alert.alert(t('error'), t('customer_shareNotAvailable'))
      }
    } catch (e: unknown) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('customer_csvFailed'))
    }
  }

  async function handleDelete(c: Customer) {
    Alert.alert(t('customer_deleteTitle'), t('confirm_delete', { name: c.name }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        try { await api.customers.delete(c.id); queryClient.invalidateQueries({ queryKey: queryKeys.customers(tenantId) }) }
        catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_deleteFailed')) }
      }},
    ])
  }

  const SEGMENT_OPTIONS: { key: SegmentKey; label: string }[] = [
    { key: 'ALL', label: t('all') },
    { key: 'VIP', label: '⭐ VIP' },
    { key: 'YENI', label: `🆕 ${t('customer_tagYENI')}` },
    { key: 'KAYIP', label: `🔴 ${t('customer_tagKAYIP')}` },
    { key: 'RISK', label: `🟠 ${t('customer_tagRISK')}` },
  ]
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'name', label: t('name') },
    { key: 'totalVisits', label: t('customer_visits') },
    { key: 'totalSpent', label: t('customer_spent') },
    { key: 'lastVisitAt', label: t('customer_lastVisit') },
  ]

  return (
    <View style={s.root}>
      <View style={[s.hero, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.heroTopRow}>
          <TouchableOpacity style={s.homeBtn} onPress={() => router.push('/')}>
            <Ionicons name="home-outline" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[s.addBtn, { paddingHorizontal: 10 }]} onPress={handleExportCSV}>
              <Ionicons name="download-outline" size={16} color="#7C3AED" />
            </TouchableOpacity>
            <TouchableOpacity style={s.addBtn} onPress={openCreate}>
              <Ionicons name="add" size={16} color="#7C3AED" />
              <Text style={s.addBtnTxt}>{t('new')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={s.heroTitle}>{t('nav_customers')}</Text>
        <Text style={s.heroSub}>{t('customer_count', { count: customers.length })}</Text>
      </View>
      <View style={s.heroCurve} />

      {/* Arama */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={17} color="#9CA3AF" style={{ marginRight: 8 }} />
        <TextInput style={s.searchInput} placeholder={t('customer_searchPlaceholder')} placeholderTextColor="#9CA3AF" value={search} onChangeText={setSearch} />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Segment filtresi */}
      <View style={s.sortBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sortContent}>
          {SEGMENT_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.key}
              style={[s.sortChip, segment === opt.key && s.sortChipActive]}
              onPress={() => { Haptics.selectionAsync(); setSegment(opt.key) }}>
              <Text style={[s.sortTxt, segment === opt.key && s.sortTxtActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sıralama */}
      <View style={[s.sortBar, { borderTopWidth: 0 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sortContent}>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.key} style={[s.sortChip, sortKey === opt.key && s.sortChipActive]} onPress={() => toggleSort(opt.key)}>
              <Text style={[s.sortTxt, sortKey === opt.key && s.sortTxtActive]}>{opt.label}</Text>
              {sortKey === opt.key && (
                <Ionicons name={sortAsc ? 'chevron-up' : 'chevron-down'} size={12} color="#7C3AED" style={{ marginLeft: 2 }} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? <SkeletonScreen rows={8} /> : (
        <FlatList
          data={sorted}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 108 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetchCustomers(); setRefreshing(false) }} tintColor="#7C3AED" />}
          ListEmptyComponent={<Text style={s.empty}>{t('customer_empty')}</Text>}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color="#7C3AED" style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => {
            const tag = getTag(item)
            return (
              <TouchableOpacity style={s.row} onPress={() => openDetail(item)}>
                <View style={[s.avatar, { backgroundColor: stringToColor(item.name) + '20' }]}>
                  {photoUris[item.id] ? (
                    <Image source={{ uri: photoUris[item.id] }} style={s.avatarImg} />
                  ) : (
                    <Text style={[s.avatarTxt, { color: stringToColor(item.name) }]}>
                      {item.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={s.rowInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.rowName}>{item.name}</Text>
                    {tag && <View style={[s.tagPill, { backgroundColor: tag.bg }]}><Text style={[s.tagTxt, { color: tag.color }]}>{t(`customer_tag${tag.key}`)}</Text></View>}
                  </View>
                  <Text style={s.rowPhone}>{item.phone}</Text>
                </View>
                <View style={s.rowRight}>
                  <Text style={s.rowVisits}>{t('customer_visitsCount', { count: item.totalVisits })}</Text>
                  {item.totalSpent > 0 && <Text style={s.rowSpent}>₺{item.totalSpent.toLocaleString()}</Text>}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* Kayıt/Düzenleme Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? t('customer_edit') : t('customer_new')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            {/* Fotoğraf seçici */}
            <TouchableOpacity style={s.photoPickerWrap} onPress={pickPhoto}>
              {pendingPhoto ? (
                <Image source={{ uri: pendingPhoto }} style={s.photoPicker} />
              ) : (
                <View style={s.photoPicker}>
                  <Ionicons name="camera-outline" size={28} color="#9CA3AF" />
                  <Text style={s.photoPickerTxt}>{t('customer_addPhoto')}</Text>
                </View>
              )}
              <View style={s.photoEditBadge}>
                <Ionicons name="pencil" size={12} color="#fff" />
              </View>
            </TouchableOpacity>

            <Field label={`${t('name')} *`} value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('customer_namePlaceholder')} />
            <Field label={`${t('phone')} *`} value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="05XX XXX XX XX" keyboardType="phone-pad" />
            <Field label={t('email')} value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="ornek@mail.com" keyboardType="email-address" />
            <Field label={t('birthday')} value={form.birthday} onChange={v => setForm(f => ({ ...f, birthday: v }))} placeholder="YYYY-MM-DD" />
            <Field label={t('notes')} value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder={t('customer_notesPlaceholder')} multiline />
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{editing ? t('update') : t('customer_add')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2', '#7C3AED']
function stringToColor(str: string) { return COLORS[str.charCodeAt(0) % COLORS.length] }

function Field({ label, value, onChange, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; keyboardType?: 'default' | 'email-address' | 'phone-pad'; multiline?: boolean
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{label}</Text>
      <TextInput style={[{ backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB' }, multiline && { height: 90 }]}
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType ?? 'default'} autoCapitalize="none" multiline={multiline} />
    </View>
  )
}

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
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 12, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E5E7EB' },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 12 },
  sortBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', height: 40 },
  sortContent: { paddingHorizontal: 10, gap: 6, alignItems: 'center', height: 40 },
  sortChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20, backgroundColor: '#F3F4F6' },
  sortChipActive: { backgroundColor: '#EDE9FE' },
  sortTxt: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  sortTxtActive: { color: '#7C3AED' },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 48, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarTxt: { fontSize: 16, fontWeight: '800' },
  photoPickerWrap: { alignSelf: 'center', marginBottom: 20, position: 'relative' },
  photoPicker: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  photoPickerTxt: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  photoEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#F9FAFB' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rowPhone: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowVisits: { fontSize: 12, color: '#6B7280' },
  rowSpent: { fontSize: 13, fontWeight: '700', color: '#059669', marginTop: 2 },
  tagPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  tagTxt: { fontSize: 10, fontWeight: '800' },
  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, padding: 20 },
  saveBtn: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
