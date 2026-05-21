import { useState, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, RefreshControl, ActivityIndicator, ScrollView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useDockPad } from '@/lib/useDockPad'
import { usePreferences } from '@/lib/usePreferences'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, Transaction, Appointment, TenantProfile } from '@/lib/api'
import { SkeletonScreen } from '@/components/SkeletonBox'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { generateAndShareInvoice } from '@/lib/invoice'
import { useTranslation } from 'react-i18next'
import { usePlanFeatures } from '@/lib/usePlanFeatures'
import UpgradeOverlay from '@/components/UpgradeOverlay'

type Tab = 'transactions' | 'debts'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const PM_COLOR: Record<string, string> = { NAKIT: '#059669', KART: '#2563EB', ONLINE: '#7C3AED' }

export default function Finans() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const dockPad = useDockPad()
  const { currencySymbol } = usePreferences()
  const planFeatures = usePlanFeatures()
  const [tab, setTab] = useState<Tab>('transactions')
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState('month')
  const [refreshing, setRefreshing] = useState(false)

  const { data: finData, isLoading: loading, refetch } = useQuery({
    queryKey: queryKeys.transactions(period),
    queryFn: async () => {
      const [txs, profile] = await Promise.all([api.transactions.list(period), api.tenant.get().catch(() => null)])
      const today = new Date()
      const days = Array.from({ length: 15 }, (_, i) => {
        const d = new Date(today); d.setDate(d.getDate() - i)
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      })
      const apts: Appointment[] = (await Promise.all(
        days.map(date => api.appointments.list({ date }).catch(() => []))
      )).flat()
      return { transactions: txs, tenantProfile: profile, debts: apts.filter((a: Appointment) => a.status === 'TAMAMLANDI' && a.paid === false) }
    },
    staleTime: 3 * 60 * 1000,
  })

  const transactions = finData?.transactions ?? []
  const tenantProfile = finData?.tenantProfile ?? null
  const debts = finData?.debts ?? []
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    type: 'GELIR' as 'GELIR' | 'GIDER',
    amount: '',
    category: '',
    description: '',
    date: todayISO(),
    paymentMethod: 'NAKIT' as 'NAKIT' | 'KART' | 'ONLINE',
    isDebt: false,
  })
  const [saving, setSaving] = useState(false)


  const revenue = transactions.filter(tx => tx.type === 'GELIR').reduce((s, tx) => s + tx.amount, 0)
  const expense = transactions.filter(tx => tx.type === 'GIDER').reduce((s, tx) => s + tx.amount, 0)
  const net = revenue - expense
  const totalDebt = debts.reduce((s, a) => s + a.price, 0)

  async function handleSave() {
    if (!form.amount || !form.category) { Alert.alert(t('warning'), t('finans_amountCategoryRequired')); return }
    setSaving(true)
    try {
      await api.transactions.create({
        type: form.type,
        amount: parseFloat(form.amount),
        category: form.category,
        description: form.description || undefined,
        date: form.date,
        paymentMethod: form.paymentMethod,
        isDebt: form.isDebt,
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setShowModal(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions(period) })
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed'))
    }
    setSaving(false)
  }

  async function handleDelete(tx: Transaction) {
    Alert.alert(t('finans_deleteTitle'), t('finans_deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        try { await api.transactions.delete(tx.id); queryClient.invalidateQueries({ queryKey: queryKeys.transactions(period) }) }
        catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_deleteFailed')) }
      }},
    ])
  }

  function invoiceLabels() {
    return {
      invoice: t('invoice_title'),
      customer: t('invoice_customer'),
      paymentMethod: t('invoice_payment_method'),
      notSpecified: t('invoice_not_specified'),
      date: t('date'),
      invoiceDate: t('invoice_date'),
      description: t('invoice_description'),
      qty: t('invoice_qty'),
      unitPrice: t('invoice_unit_price'),
      amount: t('invoice_amount'),
      subtotal: t('invoice_subtotal'),
      vat: t('invoice_vat'),
      total: t('invoice_total'),
      footer: t('invoice_footer'),
      notePrefix: t('invoice_note'),
      nakit: t('pay_cash'),
      kart: t('pay_card'),
      online: t('pay_online'),
      shareTitle: t('invoice_share_title'),
    }
  }

  async function handleTransactionInvoice(tx: Transaction) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      await generateAndShareInvoice({
        salonName: tenantProfile?.name ?? 'Salon',
        salonPhone: tenantProfile?.phone,
        salonEmail: tenantProfile?.email,
        salonAddress: tenantProfile?.address,
        invoiceNo: tx.id.slice(-8).toUpperCase(),
        date: tx.date,
        items: [{ description: `${tx.category}${tx.description ? ' - ' + tx.description : ''}`, unitPrice: tx.amount, total: tx.amount }],
        subtotal: tx.amount,
        total: tx.amount,
        paymentMethod: tx.paymentMethod,
        notes: tx.description,
        labels: invoiceLabels(),
      })
    } catch (e) { Alert.alert(t('error'), t('finans_pdfFailed')) }
  }

  async function handleAppointmentInvoice(apt: Appointment) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      await generateAndShareInvoice({
        salonName: tenantProfile?.name ?? 'Salon',
        salonPhone: tenantProfile?.phone,
        salonEmail: tenantProfile?.email,
        salonAddress: tenantProfile?.address,
        invoiceNo: apt.id.slice(-8).toUpperCase(),
        date: apt.date,
        customerName: apt.customer.name,
        customerPhone: apt.customer.phone,
        items: [{ description: `${apt.service.name}${apt.staff ? ' (' + apt.staff.name + ')' : ''}`, unitPrice: apt.price, total: apt.price }],
        subtotal: apt.price,
        total: apt.price,
        notes: apt.notes,
        labels: invoiceLabels(),
      })
    } catch (e) { Alert.alert(t('error'), t('finans_pdfFailed')) }
  }

  async function markPaid(apt: Appointment) {
    try {
      await api.appointments.update(apt.id, { paid: true })
      setDebts(prev => prev.filter(a => a.id !== apt.id))
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_updateFailed')) }
  }

  const PERIOD_OPTIONS = [
    { value: 'month', label: t('thisMonth') },
    { value: 'quarter', label: t('thisQuarter') },
    { value: 'year', label: t('thisYear') },
  ]
  const GELIR_CATEGORIES = [t('finans_catAppointment'), t('finans_catPackage'), t('finans_catProduct'), t('other')]
  const GIDER_CATEGORIES = [t('finans_catRent'), t('finans_catStaff'), t('finans_catMaterial'), t('finans_catBill'), t('finans_catAds'), t('other')]
  const PAYMENT_METHODS: { value: 'NAKIT' | 'KART' | 'ONLINE'; label: string; icon: string }[] = [
    { value: 'NAKIT', label: t('payment_NAKIT'), icon: 'cash-outline' },
    { value: 'KART',  label: t('payment_KART'),  icon: 'card-outline' },
    { value: 'ONLINE', label: t('payment_ONLINE'), icon: 'globe-outline' },
  ]
  const TABS: { key: Tab; label: string }[] = [
    { key: 'transactions', label: t('finans_transactions') },
    { key: 'debts', label: t('finans_debts') },
  ]
  const categories = form.type === 'GELIR' ? GELIR_CATEGORIES : GIDER_CATEGORIES

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => { setForm({ type: 'GELIR', amount: '', category: '', description: '', date: todayISO(), paymentMethod: 'NAKIT', isDebt: false }); setShowModal(true) }}>
            <Ionicons name="add" size={16} color="#7C3AED" />
            <Text style={s.addTxt}>{t('finans_newRecord')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.headerTitle}>{t('finans_title')}</Text>
        <Text style={s.headerSub}>{t('finans_sub')}</Text>

        <View style={s.tabBar}>
          {TABS.map(tab_ => (
            <TouchableOpacity key={tab_.key} style={[s.tabBtn, tab === tab_.key && s.tabBtnActive]} onPress={() => setTab(tab_.key)}>
              <Text style={[s.tabTxt, tab === tab_.key && s.tabTxtActive]}>{tab_.label}</Text>
              {tab_.key === 'debts' && debts.length > 0 && (
                <View style={s.badge}><Text style={s.badgeTxt}>{debts.length}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={s.headerCurve} />

      {tab === 'transactions' && (
        <>
          {/* Dönem filtresi */}
          <View style={s.periodBar}>
            {PERIOD_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.value} style={[s.periodBtn, period === opt.value && s.periodBtnActive]}
                onPress={() => { setPeriod(opt.value); setLoading(true); load(opt.value) }}>
                <Text style={[s.periodTxt, period === opt.value && s.periodTxtActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Özet kartlar */}
          <View style={s.summaryRow}>
            <View style={[s.summaryCard, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="trending-up" size={18} color="#059669" style={{ marginBottom: 6 }} />
              <Text style={s.summaryLabel}>{t('revenue')}</Text>
              <Text style={[s.summaryVal, { color: '#059669' }]}>{currencySymbol}{revenue.toLocaleString()}</Text>
            </View>
            <View style={[s.summaryCard, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="trending-down" size={18} color="#DC2626" style={{ marginBottom: 6 }} />
              <Text style={s.summaryLabel}>{t('expense')}</Text>
              <Text style={[s.summaryVal, { color: '#DC2626' }]}>{currencySymbol}{expense.toLocaleString()}</Text>
            </View>
            <View style={[s.summaryCard, { backgroundColor: net >= 0 ? '#ECFDF5' : '#FEF2F2' }]}>
              <Ionicons name="wallet-outline" size={18} color={net >= 0 ? '#059669' : '#DC2626'} style={{ marginBottom: 6 }} />
              <Text style={s.summaryLabel}>{t('netProfit')}</Text>
              <Text style={[s.summaryVal, { color: net >= 0 ? '#059669' : '#DC2626' }]}>{currencySymbol}{Math.abs(net).toLocaleString()}</Text>
            </View>
          </View>

          {loading ? <SkeletonScreen rows={5} /> : (
            <FlatList
              data={transactions}
              keyExtractor={i => i.id}
              contentContainerStyle={{ padding: 12, paddingBottom: dockPad }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false) }} tintColor="#7C3AED" />}
              ListEmptyComponent={<Text style={s.empty}>{t('finans_empty')}</Text>}
              renderItem={({ item }) => {
                const pm = PAYMENT_METHODS.find(p => p.value === item.paymentMethod)
                return (
                  <TouchableOpacity style={s.row} onLongPress={() => handleDelete(item)}>
                    <View style={[s.typeIcon, { backgroundColor: item.type === 'GELIR' ? '#ECFDF5' : '#FEF2F2' }]}>
                      <Ionicons
                        name={item.type === 'GELIR' ? 'trending-up' : 'trending-down'}
                        size={20}
                        color={item.type === 'GELIR' ? '#059669' : '#DC2626'}
                      />
                    </View>
                    <View style={s.rowInfo}>
                      <Text style={s.rowCategory}>{item.category}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={s.rowDate}>{new Date(item.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
                        {pm && (
                          <View style={[s.pmBadge, { backgroundColor: PM_COLOR[pm.value] + '18' }]}>
                            <Ionicons name={pm.icon as any} size={10} color={PM_COLOR[pm.value]} />
                            <Text style={[s.pmTxt, { color: PM_COLOR[pm.value] }]}>{pm.label}</Text>
                          </View>
                        )}
                        {item.isDebt && <View style={s.debtBadge}><Text style={s.debtBadgeTxt}>{t('finans_debt')}</Text></View>}
                        {item.description ? <Text style={s.rowDate}>· {item.description}</Text> : null}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={[s.rowAmount, { color: item.type === 'GELIR' ? '#059669' : '#DC2626' }]}>
                        {item.type === 'GELIR' ? '+' : '-'}{currencySymbol}{item.amount.toLocaleString()}
                      </Text>
                      <TouchableOpacity style={s.invoiceBtn} onPress={() => handleTransactionInvoice(item)}>
                        <Ionicons name="document-text-outline" size={12} color="#7C3AED" />
                        <Text style={s.invoiceBtnTxt}>PDF</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                )
              }}
            />
          )}
        </>
      )}

      {tab === 'debts' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: dockPad }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false) }} tintColor="#7C3AED" />}>

          {debts.length > 0 && (
            <View style={s.debtSummary}>
              <Text style={s.debtSummaryLabel}>{t('finans_totalDebt')}</Text>
              <Text style={s.debtSummaryVal}>{currencySymbol}{totalDebt.toLocaleString()}</Text>
            </View>
          )}

          {loading ? <SkeletonScreen rows={4} /> :
            debts.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="checkmark-circle-outline" size={56} color="#D1FAE5" />
                <Text style={{ color: '#9CA3AF', marginTop: 12, fontSize: 14 }}>{t('finans_noDebts')}</Text>
              </View>
            ) : debts.map(apt => (
              <View key={apt.id} style={s.debtRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.debtName}>{apt.customer.name}</Text>
                  <Text style={s.debtSvc}>{apt.service.name}</Text>
                  <Text style={s.debtDate}>{new Date(apt.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {apt.startTime}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <Text style={s.debtAmount}>{currencySymbol}{apt.price.toLocaleString()}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={s.invoiceBtn} onPress={() => handleAppointmentInvoice(apt)}>
                      <Ionicons name="document-text-outline" size={12} color="#7C3AED" />
                      <Text style={s.invoiceBtnTxt}>PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.paidBtn} onPress={() => markPaid(apt)}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text style={s.paidTxt}>{t('paid')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          }
        </ScrollView>
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{t('finans_newRecord')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>{t('finans_type')} *</Text>
            <View style={s.typeRow}>
              {(['GELIR', 'GIDER'] as const).map(type_ => (
                <TouchableOpacity key={type_} style={[s.typeBtn, form.type === type_ && (type_ === 'GELIR' ? s.typeBtnGelir : s.typeBtnGider)]}
                  onPress={() => setForm(f => ({ ...f, type: type_, category: '' }))}>
                  <Ionicons name={type_ === 'GELIR' ? 'trending-up' : 'trending-down'} size={16} color={form.type === type_ ? '#fff' : '#374151'} />
                  <Text style={[s.typeBtnTxt, form.type === type_ && { color: '#fff' }]}>{type_ === 'GELIR' ? t('revenue') : t('expense')}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>{t('finans_paymentMethod')}</Text>
            <View style={s.typeRow}>
              {PAYMENT_METHODS.map(pm => (
                <TouchableOpacity key={pm.value} style={[s.pmBtn, form.paymentMethod === pm.value && { backgroundColor: PM_COLOR[pm.value] }]}
                  onPress={() => setForm(f => ({ ...f, paymentMethod: pm.value }))}>
                  <Ionicons name={pm.icon as any} size={16} color={form.paymentMethod === pm.value ? '#fff' : '#374151'} />
                  <Text style={[s.pmBtnTxt, form.paymentMethod === pm.value && { color: '#fff' }]}>{pm.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>{t('finans_category')} *</Text>
            <View style={s.catGrid}>
              {categories.map(c => (
                <TouchableOpacity key={c} style={[s.catChip, form.category === c && s.catChipActive]} onPress={() => setForm(f => ({ ...f, category: c }))}>
                  <Text style={[s.catTxt, form.category === c && s.catTxtActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>{t('amount')} ({currencySymbol}) *</Text>
            <TextInput style={s.input} value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v }))} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#9CA3AF" />

            <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('description')}</Text>
            <TextInput style={s.input} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder={t('optional')} placeholderTextColor="#9CA3AF" />

            <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('date')}</Text>
            <TextInput style={s.input} value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" />

            {form.type === 'GELIR' && (
              <TouchableOpacity style={[s.debtToggle, form.isDebt && s.debtToggleActive]} onPress={() => setForm(f => ({ ...f, isDebt: !f.isDebt }))}>
                <Ionicons name={form.isDebt ? 'checkbox' : 'square-outline'} size={20} color={form.isDebt ? '#7C3AED' : '#9CA3AF'} />
                <Text style={[s.debtToggleTxt, form.isDebt && { color: '#7C3AED' }]}>{t('finans_markAsDebt')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[s.saveBtn, { backgroundColor: form.type === 'GELIR' ? '#059669' : '#DC2626' }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{t('save')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {!planFeatures.loading && !planFeatures.hasFinance && (
        <UpgradeOverlay
          requiredPlan={planFeatures.upgradeForFinance}
          icon="wallet-outline"
          title={t('upgrade_finance_title')}
          description={t('upgrade_finance_desc')}
          features={[t('upgrade_finance_f1'), t('upgrade_finance_f2'), t('upgrade_finance_f3'), t('upgrade_finance_f4')]}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#059669', paddingBottom: 0, paddingHorizontal: 16, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#047857', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerCurve: { height: 20, backgroundColor: '#059669', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  addTxt: { color: '#059669', fontWeight: '700', fontSize: 13 },
  tabBar: { flexDirection: 'row', gap: 6, paddingBottom: 16 },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  tabBtnActive: { backgroundColor: '#fff' },
  tabTxt: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  tabTxtActive: { color: '#059669' },
  badge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  periodBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  periodBtnActive: { backgroundColor: '#059669' },
  periodTxt: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  periodTxtActive: { color: '#fff' },
  summaryRow: { flexDirection: 'row', gap: 10, padding: 12 },
  summaryCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4, fontWeight: '600' },
  summaryVal: { fontSize: 16, fontWeight: '800' },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 48, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, gap: 12 },
  typeIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  rowInfo: { flex: 1 },
  rowCategory: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rowDate: { fontSize: 12, color: '#9CA3AF' },
  pmBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  pmTxt: { fontSize: 10, fontWeight: '700' },
  debtBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  debtBadgeTxt: { color: '#D97706', fontSize: 10, fontWeight: '700' },
  rowAmount: { fontSize: 15, fontWeight: '800' },
  debtSummary: { backgroundColor: '#7C3AED', borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  debtSummaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  debtSummaryVal: { color: '#fff', fontSize: 22, fontWeight: '900' },
  debtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  debtName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  debtSvc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  debtDate: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  debtAmount: { fontSize: 16, fontWeight: '900', color: '#DC2626' },
  paidBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  paidTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  invoiceBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  invoiceBtnTxt: { fontSize: 10, fontWeight: '800', color: '#7C3AED' },
  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, padding: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB' },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: 12, backgroundColor: '#F3F4F6' },
  typeBtnGelir: { backgroundColor: '#059669' },
  typeBtnGider: { backgroundColor: '#DC2626' },
  typeBtnTxt: { fontSize: 14, fontWeight: '700', color: '#374151' },
  pmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 12, borderRadius: 12, backgroundColor: '#F3F4F6' },
  pmBtnTxt: { fontSize: 13, fontWeight: '700', color: '#374151' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
  catChipActive: { backgroundColor: '#059669' },
  catTxt: { fontSize: 13, fontWeight: '600', color: '#374151' },
  catTxtActive: { color: '#fff' },
  debtToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#F3F4F6', marginTop: 14 },
  debtToggleActive: { backgroundColor: '#F5F3FF', borderWidth: 1.5, borderColor: '#7C3AED' },
  debtToggleTxt: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
