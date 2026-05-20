import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { usePreferences } from '@/lib/usePreferences'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, Product, StockMovement } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { usePlanFeatures } from '@/lib/usePlanFeatures'
import UpgradeOverlay from '@/components/UpgradeOverlay'

const CATEGORY_ENTRIES: { value: string; labelKey: string }[] = [
  { value: 'Boya', labelKey: 'stock_cat_boya' },
  { value: 'Şampuan', labelKey: 'stock_cat_sampuan' },
  { value: 'Bakım', labelKey: 'stock_cat_bakim' },
  { value: 'Aksesuar', labelKey: 'stock_cat_aksesuar' },
  { value: 'Temizlik', labelKey: 'stock_cat_temizlik' },
  { value: 'Diğer', labelKey: 'stock_cat_diger' },
]
const UNIT_ENTRIES: { value: string; labelKey: string }[] = [
  { value: 'adet', labelKey: 'stock_unit_adet' },
  { value: 'ml', labelKey: 'stock_unit_ml' },
  { value: 'gr', labelKey: 'stock_unit_gr' },
  { value: 'lt', labelKey: 'stock_unit_lt' },
  { value: 'kg', labelKey: 'stock_unit_kg' },
  { value: 'kutu', labelKey: 'stock_unit_kutu' },
]

export default function Stok() {
  const { t } = useTranslation()
  const headerPad = useHeaderPad()
  const { currencySymbol } = usePreferences()
  const router = useRouter()
  const planFeatures = usePlanFeatures()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [movementProduct, setMovementProduct] = useState<Product | null>(null)
  const [movementType, setMovementType] = useState<'GIRIS' | 'CIKIS'>('GIRIS')
  const [movementQty, setMovementQty] = useState('')
  const [movementNote, setMovementNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [history, setHistory] = useState<StockMovement[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', category: '', unit: 'adet',
    quantity: '0', minQuantity: '5', costPrice: '', sellPrice: '',
  })

  const load = useCallback(async () => {
    try { setProducts(await api.products.list()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const lowStock = products.filter(p => p.quantity <= p.minQuantity)

  function openCreate() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditing(null)
    setForm({ name: '', category: '', unit: 'adet', quantity: '0', minQuantity: '5', costPrice: '', sellPrice: '' })
    setShowNew(true)
  }

  function openEdit(p: Product) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditing(p)
    setForm({
      name: p.name, category: p.category ?? '', unit: p.unit,
      quantity: String(p.quantity), minQuantity: String(p.minQuantity),
      costPrice: p.costPrice ? String(p.costPrice) : '',
      sellPrice: p.sellPrice ? String(p.sellPrice) : '',
    })
    setShowNew(true)
  }

  async function handleSave() {
    if (!form.name) { Alert.alert(t('warning'), t('stok_name_required')); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        category: form.category || undefined,
        unit: form.unit,
        quantity: parseFloat(form.quantity) || 0,
        minQuantity: parseFloat(form.minQuantity) || 5,
        costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
        sellPrice: form.sellPrice ? parseFloat(form.sellPrice) : undefined,
      }
      if (editing) {
        const updated = await api.products.update(editing.id, payload)
        setProducts(prev => prev.map(p => p.id === editing.id ? { ...p, ...updated } : p))
      } else {
        await api.products.create(payload)
        load()
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setShowNew(false)
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed'))
    }
    setSaving(false)
  }

  async function handleMovement() {
    if (!movementProduct || !movementQty) return
    setSaving(true)
    try {
      const updated = await api.products.movement(movementProduct.id, movementType, parseFloat(movementQty), movementNote || undefined)
      setProducts(prev => prev.map(p => p.id === movementProduct.id ? { ...p, ...updated } : p))
      setMovementProduct(null); setMovementQty(''); setMovementNote('')
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed')) }
    setSaving(false)
  }

  async function openHistory(p: Product) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setHistoryProduct(p)
    setHistoryLoading(true)
    try { setHistory(await api.stockMovements.list(p.id)) } catch { setHistory([]) }
    setHistoryLoading(false)
  }

  async function handleDelete(p: Product) {
    Alert.alert(t('stok_delete_title'), t('confirm_delete', { name: p.name }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        try { await api.products.delete(p.id); setProducts(prev => prev.filter(x => x.id !== p.id)) }
        catch { Alert.alert(t('error'), t('err_failed')) }
      }},
    ])
  }

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.heroTopRow}>
          <TouchableOpacity style={s.homeBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={openCreate}>
            <Ionicons name="add" size={16} color="#059669" />
            <Text style={s.addBtnTxt}>{t('stok_new_btn')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.heroTitle}>{t('stok_title')}</Text>
        <Text style={s.heroSub}>
          {t('stok_products_count', { count: products.length })} · {lowStock.length > 0 ? `⚠️ ${t('stok_critical_count', { count: lowStock.length })}` : t('stok_healthy')}
        </Text>
      </View>
      <View style={s.heroCurve} />

      {lowStock.length > 0 && (
        <View style={s.alertBar}>
          <Ionicons name="warning-outline" size={16} color="#D97706" />
          <Text style={s.alertTxt}>{lowStock.map(p => p.name).join(', ')} — {t('stok_critical_alert')}</Text>
        </View>
      )}

      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={17} color="#9CA3AF" style={{ marginRight: 8 }} />
        <TextInput style={s.searchInput} placeholder={t('stok_search_placeholder')} placeholderTextColor="#9CA3AF" value={search} onChangeText={setSearch} />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#9CA3AF" /></TouchableOpacity>}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#059669" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 108 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#059669" />}
          ListEmptyComponent={<Text style={s.empty}>{t('stok_empty')}</Text>}
          renderItem={({ item }) => {
            const low = item.quantity <= item.minQuantity
            return (
              <View style={[s.row, low && s.rowLow]}>
                <View style={[s.catDot, { backgroundColor: low ? '#EF4444' : '#059669' }]} />
                <View style={s.rowBody}>
                  <View style={s.rowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowName}>{item.name}</Text>
                      {item.category && <Text style={s.rowCat}>{item.category}</Text>}
                    </View>
                    <View style={s.rowRight}>
                      <Text style={[s.rowQty, low && { color: '#EF4444' }]}>{item.quantity} {item.unit}</Text>
                      {item.sellPrice && <Text style={s.rowPrice}>{currencySymbol}{item.sellPrice}</Text>}
                    </View>
                  </View>
                  <View style={s.rowActions}>
                    <TouchableOpacity style={s.actionBtn} onPress={() => { Haptics.selectionAsync(); setMovementType('GIRIS'); setMovementProduct(item) }}>
                      <Ionicons name="add-circle-outline" size={15} color="#059669" />
                      <Text style={[s.actionTxt, { color: '#059669' }]}>{t('stok_in_action')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => { Haptics.selectionAsync(); setMovementType('CIKIS'); setMovementProduct(item) }}>
                      <Ionicons name="remove-circle-outline" size={15} color="#EA580C" />
                      <Text style={[s.actionTxt, { color: '#EA580C' }]}>{t('stok_out_action')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(item)}>
                      <Ionicons name="pencil-outline" size={15} color="#6B7280" />
                      <Text style={[s.actionTxt, { color: '#6B7280' }]}>{t('edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => openHistory(item)}>
                      <Ionicons name="time-outline" size={15} color="#7C3AED" />
                      <Text style={[s.actionTxt, { color: '#7C3AED' }]}>{t('stok_history_action')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => handleDelete(item)}>
                      <Ionicons name="trash-outline" size={15} color="#EF4444" />
                      <Text style={[s.actionTxt, { color: '#EF4444' }]}>{t('delete')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }}
        />
      )}

      {/* Ürün Ekle/Düzenle Modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? t('stok_edit_product') : t('stok_new_product')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowNew(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Field label={t('stok_product_name_field')} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder={t('stok_product_name_placeholder')} />

            <Text style={s.label}>{t('stok_category')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {CATEGORY_ENTRIES.map(cat => (
                  <TouchableOpacity key={cat.value} style={[s.chipBtn, form.category === cat.value && s.chipBtnActive]} onPress={() => setForm(f => ({ ...f, category: cat.value }))}>
                    <Text style={[s.chipTxt, form.category === cat.value && s.chipTxtActive]}>{t(cat.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.label}>{t('stok_unit')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {UNIT_ENTRIES.map(u => (
                  <TouchableOpacity key={u.value} style={[s.chipBtn, form.unit === u.value && s.chipBtnActive]} onPress={() => setForm(f => ({ ...f, unit: u.value }))}>
                    <Text style={[s.chipTxt, form.unit === u.value && s.chipTxtActive]}>{t(u.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Field label={t('stok_current_qty')} value={form.quantity} onChangeText={v => setForm(f => ({ ...f, quantity: v }))} keyboardType="numeric" /></View>
              <View style={{ flex: 1 }}><Field label={t('stok_min_qty')} value={form.minQuantity} onChangeText={v => setForm(f => ({ ...f, minQuantity: v }))} keyboardType="numeric" /></View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Field label={t('stok_cost_price')} value={form.costPrice} onChangeText={v => setForm(f => ({ ...f, costPrice: v }))} keyboardType="numeric" placeholder="0" /></View>
              <View style={{ flex: 1 }}><Field label={t('stok_sell_price')} value={form.sellPrice} onChangeText={v => setForm(f => ({ ...f, sellPrice: v }))} keyboardType="numeric" placeholder="0" /></View>
            </View>

            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{editing ? t('update') : t('stok_add_product')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Stok Hareketi Modal */}
      <Modal visible={!!movementProduct} animationType="slide" presentationStyle="formSheet">
        {movementProduct && (
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{movementType === 'GIRIS' ? t('stok_stock_in_title') : t('stok_stock_out_title')}</Text>
              <TouchableOpacity style={s.closeBtn} onPress={() => setMovementProduct(null)}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 16 }}>{movementProduct.name}</Text>
              <Text style={s.label}>{t('stok_qty_label')}</Text>
              <TextInput style={s.input} value={movementQty} onChangeText={setMovementQty} keyboardType="numeric" placeholder={`0 ${movementProduct.unit}`} placeholderTextColor="#9CA3AF" autoFocus />
              <Text style={s.label}>{t('stok_qty_note')}</Text>
              <TextInput style={s.input} value={movementNote} onChangeText={setMovementNote} placeholder={t('optional')} placeholderTextColor="#9CA3AF" />
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: movementType === 'GIRIS' ? '#059669' : '#EA580C', marginTop: 20 }]}
                onPress={handleMovement} disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{movementType === 'GIRIS' ? t('stok_do_in') : t('stok_do_out')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      {/* Hareket Geçmişi Modal */}
      <Modal visible={!!historyProduct} animationType="slide" presentationStyle="pageSheet">
        {historyProduct && (
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>{t('stok_history_title')}</Text>
                <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{historyProduct.name}</Text>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={() => setHistoryProduct(null)}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody}>
              {historyLoading ? (
                <ActivityIndicator color="#059669" style={{ marginTop: 32 }} />
              ) : history.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                  <Ionicons name="time-outline" size={48} color="#E5E7EB" />
                  <Text style={{ color: '#9CA3AF', marginTop: 12, fontSize: 14 }}>{t('stok_no_history')}</Text>
                </View>
              ) : history.map((m, i) => (
                <View key={m.id} style={[s.histRow, i < history.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}>
                  <View style={[s.histIcon, { backgroundColor: m.type === 'GIRIS' ? '#ECFDF5' : '#FFF7ED' }]}>
                    <Ionicons name={m.type === 'GIRIS' ? 'arrow-down-circle' : 'arrow-up-circle'} size={22} color={m.type === 'GIRIS' ? '#059669' : '#EA580C'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.histType}>{m.type === 'GIRIS' ? t('stok_hist_in') : t('stok_hist_out')}</Text>
                    {m.note && <Text style={s.histNote}>{m.note}</Text>}
                    <Text style={s.histDate}>{new Date(m.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <Text style={[s.histQty, { color: m.type === 'GIRIS' ? '#059669' : '#EA580C' }]}>
                    {m.type === 'GIRIS' ? '+' : '-'}{m.quantity} {historyProduct.unit}
                  </Text>
                </View>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        )}
      </Modal>

      {!planFeatures.loading && !planFeatures.hasStock && (
        <UpgradeOverlay
          requiredPlan={planFeatures.upgradeForStock}
          icon="cube-outline"
          title={t('upgrade_stock_title')}
          description={t('upgrade_stock_desc')}
          features={[t('upgrade_stock_f1'), t('upgrade_stock_f2'), t('upgrade_stock_f3'), t('upgrade_stock_f4')]}
        />
      )}
    </View>
  )
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: any
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9CA3AF" keyboardType={keyboardType} />
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { backgroundColor: '#059669', paddingBottom: 28, paddingHorizontal: 20, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#047857', opacity: 0.4, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  homeBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  heroCurve: { height: 20, backgroundColor: '#059669', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnTxt: { color: '#059669', fontWeight: '700', fontSize: 13 },
  alertBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
  alertTxt: { flex: 1, fontSize: 12, color: '#92400E', fontWeight: '600' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 12, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E5E7EB', height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 48, fontSize: 14 },
  row: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  rowLow: { borderWidth: 1.5, borderColor: '#FCA5A5' },
  catDot: { width: 4 },
  rowBody: { flex: 1, padding: 14 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rowCat: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowQty: { fontSize: 16, fontWeight: '800', color: '#059669' },
  rowPrice: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F9FAFB' },
  actionTxt: { fontSize: 11, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12 },
  chipBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  chipBtnActive: { backgroundColor: '#ECFDF5', borderColor: '#059669' },
  chipTxt: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  chipTxtActive: { color: '#059669' },
  saveBtn: { backgroundColor: '#059669', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, backgroundColor: '#fff', paddingHorizontal: 0 },
  histIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  histType: { fontSize: 13, fontWeight: '700', color: '#111827' },
  histNote: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  histDate: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  histQty: { fontSize: 16, fontWeight: '900' },
})
