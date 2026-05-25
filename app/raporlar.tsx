import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, RefreshControl, TextInput, Modal, Alert, Animated, Easing } from 'react-native'
import { useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useDockPad } from '@/lib/useDockPad'
import { usePreferences } from '@/lib/usePreferences'
import { Ionicons } from '@expo/vector-icons'
import { api, DashboardStats, ServiceRevenue, StaffRevenue } from '@/lib/api'
import { detectCountry, getPricing } from '@/lib/pricing'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { useTranslation } from 'react-i18next'
import { usePlanFeatures } from '@/lib/usePlanFeatures'
import UpgradeOverlay from '@/components/UpgradeOverlay'

type Tab = 'general' | 'services' | 'staff'

export default function Raporlar() {
  const { t } = useTranslation()
  const headerPad = useHeaderPad()
  const dockPad = useDockPad()
  const { currencySymbol: symbol } = usePreferences()
  const router = useRouter()
  const planFeatures = usePlanFeatures()
  const [tab, setTab] = useState<Tab>('general')
  const [period, setPeriod] = useState('month')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [services, setServices] = useState<ServiceRevenue[]>([])
  const [staff, setStaff] = useState<StaffRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [exporting, setExporting] = useState(false)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'general', label: t('report_tab_general') },
    { key: 'services', label: t('hizmetler_title') },
    { key: 'staff', label: t('staff_title') },
  ]

  const PERIOD_OPTIONS = [
    { value: 'month', label: t('this_month') },
    { value: 'quarter', label: t('report_period_3month') },
    { value: 'year', label: t('this_year') },
    { value: 'custom', label: t('report_custom_period') },
  ]

  const load = useCallback(async (p = period, from = customFrom, to = customTo) => {
    try {
      const data = await api.dashboard.stats()
      setStats(data)
    } catch {}
    try {
      const params = p === 'custom' && from && to ? `custom&from=${from}&to=${to}` : p
      const [svc, stf] = await Promise.all([
        api.reports.serviceRevenue(params),
        api.reports.staffRevenue(params),
      ])
      setServices(svc)
      setStaff(stf)
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [period, customFrom, customTo])

  useEffect(() => { load() }, [load])

  function onPeriod(p: string) {
    if (p === 'custom') { setShowCustomModal(true); return }
    setPeriod(p)
    setLoading(true)
    load(p)
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) { Alert.alert(t('warning'), t('report_range_required')); return }
    setPeriod('custom')
    setShowCustomModal(false)
    setLoading(true)
    load('custom', customFrom, customTo)
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      const periodLabel = period === 'month' ? t('this_month') : period === 'quarter' ? t('report_period_3month') : period === 'year' ? t('this_year') : `${customFrom} – ${customTo}`
      const svcRows = services.map(sv => `<tr><td>${sv.serviceName}</td><td style="text-align:right">${sv.count}</td><td style="text-align:right">${symbol}${sv.revenue.toLocaleString()}</td></tr>`).join('')
      const stfRows = staff.map(st => `<tr><td>${st.staffName}</td><td style="text-align:right">${st.count}</td><td style="text-align:right">${symbol}${st.revenue.toLocaleString()}</td></tr>`).join('')
      const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"/>
<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;padding:40px;color:#111827}
h1{color:#7C3AED;font-size:26px;margin-bottom:4px}
h2{font-size:16px;color:#374151;margin-top:28px;margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
thead{background:#7C3AED}thead th{color:#fff;padding:10px 12px;text-align:left;font-size:13px}
tbody tr:nth-child(even){background:#F9FAFB}
tbody td{padding:9px 12px;font-size:13px;border-bottom:1px solid #F3F4F6}
.summary{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px}
.card{background:#F5F3FF;border-radius:12px;padding:16px 20px;flex:1}
.card-label{font-size:11px;color:#6B7280;margin-bottom:4px}
.card-val{font-size:22px;font-weight:900;color:#7C3AED}
.footer{margin-top:40px;font-size:11px;color:#9CA3AF;text-align:center}
</style></head><body>
<h1>HemenSalon ${t('menu_raporlar')}</h1>
<p style="color:#6B7280;font-size:13px">${t('report_custom_range')}: ${periodLabel} · ${new Date().toLocaleDateString(undefined)}</p>
<div class="summary">
  <div class="card"><div class="card-label">${t('revenue')}</div><div class="card-val">${symbol}${(stats?.revenue ?? 0).toLocaleString()}</div></div>
  <div class="card"><div class="card-label">${t('expense')}</div><div class="card-val">${symbol}${(stats?.expense ?? 0).toLocaleString()}</div></div>
  <div class="card"><div class="card-label">${t('report_net_profit_loss')}</div><div class="card-val">${symbol}${(stats?.netProfit ?? 0).toLocaleString()}</div></div>
</div>
<h2>${t('report_service_revenue')}</h2>
<table><thead><tr><th>${t('hizmetler_title')}</th><th style="text-align:right">${t('nav_appointments')}</th><th style="text-align:right">${t('revenue')}</th></tr></thead><tbody>${svcRows || `<tr><td colspan="3" style="text-align:center;color:#9CA3AF">${t('no_data')}</td></tr>`}</tbody></table>
<h2>${t('report_staff_revenue')}</h2>
<table><thead><tr><th>${t('staff_title')}</th><th style="text-align:right">${t('nav_appointments')}</th><th style="text-align:right">${t('revenue')}</th></tr></thead><tbody>${stfRows || `<tr><td colspan="3" style="text-align:center;color:#9CA3AF">${t('no_data')}</td></tr>`}</tbody></table>
<div class="footer">HemenSalon · hemensalon.com</div>
</body></html>`
      const { uri } = await Print.printToFileAsync({ html, base64: false })
      const canShare = await Sharing.isAvailableAsync()
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('share') })
      } else {
        await Print.printAsync({ html })
      }
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('pdf_error')) }
    setExporting(false)
  }

  const netProfit = stats?.netProfit ?? 0
  const revenue = stats?.revenue ?? 0
  const expense = stats?.expense ?? 0
  const profitMargin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0
  const maxSvcRev = services[0]?.revenue || 1
  const maxStfRev = staff[0]?.revenue || 1

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.pdfBtn} onPress={handleExportPDF} disabled={exporting}>
            {exporting
              ? <ActivityIndicator size="small" color="#7C3AED" />
              : <><Ionicons name="document-outline" size={14} color="#7C3AED" /><Text style={s.pdfBtnTxt}>PDF</Text></>
            }
          </TouchableOpacity>
        </View>
        <Text style={s.headerTitle}>{t('menu_raporlar')}</Text>
        <Text style={s.headerSub}>{t('report_performance')}</Text>

        <View style={s.tabBar}>
          {TABS.map(tb => (
            <TouchableOpacity key={tb.key} style={[s.tabBtn, tab === tb.key && s.tabBtnActive]} onPress={() => setTab(tb.key)}>
              <Text style={[s.tabTxt, tab === tb.key && s.tabTxtActive]}>{tb.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={s.headerCurve} />

      {tab !== 'general' && (
        <View style={s.periodBar}>
          {PERIOD_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.value} style={[s.periodBtn, period === opt.value && s.periodBtnActive]}
              onPress={() => onPeriod(opt.value)}>
              <Text style={[s.periodTxt, period === opt.value && s.periodTxtActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          {period === 'custom' && customFrom && customTo && (
            <Text style={s.customRangeTxt}>{customFrom} – {customTo}</Text>
          )}
        </View>
      )}

      <Modal visible={showCustomModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.customModal}>
          <View style={s.customModalHeader}>
            <Text style={s.customModalTitle}>{t('report_custom_range')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowCustomModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <View style={s.customModalBody}>
            <Text style={s.customLabel}>{t('report_start_date')}</Text>
            <TextInput style={s.customInput} value={customFrom} onChangeText={setCustomFrom} placeholder="2025-01-01" placeholderTextColor="#9CA3AF" keyboardType="numbers-and-punctuation" />
            <Text style={s.customLabel}>{t('report_end_date')}</Text>
            <TextInput style={s.customInput} value={customTo} onChangeText={setCustomTo} placeholder="2025-12-31" placeholderTextColor="#9CA3AF" keyboardType="numbers-and-punctuation" />
            <TouchableOpacity style={s.applyBtn} onPress={applyCustomRange}>
              <Text style={s.applyTxt}>{t('report_apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading ? <RaporlarSkeleton /> : (
        <ScrollView style={s.body} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}>

          {tab === 'general' && (
            <>
              <Text style={s.sectionTitle}>{t('report_month_summary')}</Text>
              <View style={s.grid}>
                <ReportCard label={t('nav_appointments')} value={String(stats?.month ?? 0)} iconName="calendar-outline" color="#2563EB" bg="#EFF6FF" />
                <ReportCard label={t('customers')} value={String(stats?.customersCount ?? 0)} iconName="people-outline" color="#7C3AED" bg="#F5F3FF" />
                {planFeatures.hasReports
                  ? <ReportCard label={t('revenue')} value={`${symbol}${revenue.toLocaleString()}`} iconName="trending-up" color="#059669" bg="#ECFDF5" />
                  : <ReportCard label={t('revenue')} value="—" iconName="trending-up" color="#9CA3AF" bg="#F3F4F6" locked />
                }
                {planFeatures.hasReports
                  ? <ReportCard label={t('expense')} value={`${symbol}${expense.toLocaleString()}`} iconName="trending-down" color="#DC2626" bg="#FEF2F2" />
                  : <ReportCard label={t('expense')} value="—" iconName="trending-down" color="#9CA3AF" bg="#F3F4F6" locked />
                }
              </View>

              {planFeatures.hasReports ? (
                <>
                  <View style={[s.bigCard, { backgroundColor: netProfit >= 0 ? '#ECFDF5' : '#FEF2F2' }]}>
                    <Text style={s.bigCardLabel}>{t('report_net_profit_loss')}</Text>
                    <Text style={[s.bigCardVal, { color: netProfit >= 0 ? '#059669' : '#DC2626' }]}>
                      {netProfit >= 0 ? '+' : '-'}{symbol}{Math.abs(netProfit).toLocaleString()}
                    </Text>
                    <Text style={s.bigCardSub}>{t('report_profit_margin', { pct: profitMargin })}</Text>
                  </View>

                  <Text style={s.sectionTitle}>{t('report_revenue_expense')}</Text>
                  <View style={s.barCard}>
                    <View style={s.barRow}>
                      <Text style={s.barLabel}>{t('revenue')}</Text>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: '100%', backgroundColor: '#059669' }]} />
                      </View>
                      <Text style={s.barVal}>{symbol}{revenue.toLocaleString()}</Text>
                    </View>
                    <View style={s.barRow}>
                      <Text style={s.barLabel}>{t('expense')}</Text>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${revenue > 0 ? Math.min((expense / revenue) * 100, 100) : 0}%` as any, backgroundColor: '#DC2626' }]} />
                      </View>
                      <Text style={s.barVal}>{symbol}{expense.toLocaleString()}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <TouchableOpacity style={s.upgradeBox} onPress={() => router.push('/abonelik' as never)} activeOpacity={0.85}>
                  <View style={s.upgradeBoxLeft}>
                    <Ionicons name="lock-closed" size={18} color="#7C3AED" />
                    <View>
                      <Text style={s.upgradeBoxTitle}>{t('report_upgrade_title')}</Text>
                      <Text style={s.upgradeBoxSub}>{t('report_upgrade_sub')}</Text>
                    </View>
                  </View>
                  <View style={s.upgradeBoxBadge}>
                    <Text style={s.upgradeBoxBadgeTxt}>{t('report_upgrade_cta')}</Text>
                  </View>
                </TouchableOpacity>
              )}

            </>
          )}

          {tab === 'services' && !planFeatures.hasReports && (
            <View style={s.tabLockWrap}>
              <UpgradeOverlay
                requiredPlan={planFeatures.upgradeForReports}
                icon="bar-chart-outline"
                title={t('upgrade_report_svc_title')}
                description={t('upgrade_report_svc_desc')}
                features={[t('upgrade_report_svc_f1'), t('upgrade_report_svc_f2'), t('upgrade_report_svc_f3')]}
              />
            </View>
          )}

          {tab === 'services' && planFeatures.hasReports && (
            <>
              {services.length === 0 ? (
                <EmptyState text={t('report_service_no_data')} />
              ) : (
                <>
                  <Text style={s.sectionTitle}>{t('report_service_revenue')}</Text>
                  <View style={s.barCard}>
                    {services.map((svc, i) => {
                      const pct = (svc.revenue / maxSvcRev) * 100
                      return (
                        <View key={svc.serviceId} style={[s.itemRow, i < services.length - 1 && s.itemRowBorder]}>
                          <View style={[s.colorDot, { backgroundColor: svc.serviceColor }]} />
                          <View style={{ flex: 1 }}>
                            <View style={s.itemTopRow}>
                              <Text style={s.itemName}>{svc.serviceName}</Text>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={s.itemRevenue}>{symbol}{svc.revenue.toLocaleString()}</Text>
                                <Text style={s.itemSub}>{t('report_apt_count', { count: svc.count })}</Text>
                              </View>
                            </View>
                            <View style={s.barTrack}>
                              <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: svc.serviceColor }]} />
                            </View>
                          </View>
                        </View>
                      )
                    })}
                  </View>

                  {services.length > 0 && (
                    <View style={s.topCard}>
                      <Ionicons name="trophy-outline" size={20} color="#D97706" />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={s.topCardLabel}>{t('report_top_service')}</Text>
                        <Text style={s.topCardName}>{services[0].serviceName}</Text>
                      </View>
                      <Text style={s.topCardVal}>{symbol}{services[0].revenue.toLocaleString()}</Text>
                    </View>
                  )}
                </>
              )}
            </>
          )}

          {tab === 'staff' && !planFeatures.hasReports && (
            <View style={s.tabLockWrap}>
              <UpgradeOverlay
                requiredPlan={planFeatures.upgradeForReports}
                icon="people-outline"
                title={t('upgrade_report_staff_title')}
                description={t('upgrade_report_staff_desc')}
                features={[t('upgrade_report_staff_f1'), t('upgrade_report_staff_f2'), t('upgrade_report_staff_f3')]}
              />
            </View>
          )}

          {tab === 'staff' && planFeatures.hasReports && (
            <>
              {staff.length === 0 ? (
                <EmptyState text={t('report_staff_no_data')} />
              ) : (
                <>
                  <Text style={s.sectionTitle}>{t('report_staff_revenue')}</Text>
                  <View style={s.barCard}>
                    {staff.map((st, i) => {
                      const pct = (st.revenue / maxStfRev) * 100
                      const avgPerApt = st.count > 0 ? Math.round(st.revenue / st.count) : 0
                      return (
                        <View key={st.staffId} style={[s.itemRow, i < staff.length - 1 && s.itemRowBorder]}>
                          <View style={[s.colorDot, { backgroundColor: st.staffColor }]} />
                          <View style={{ flex: 1 }}>
                            <View style={s.itemTopRow}>
                              <Text style={s.itemName}>{st.staffName}</Text>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={s.itemRevenue}>{symbol}{st.revenue.toLocaleString()}</Text>
                                <Text style={s.itemSub}>{t('report_apt_count', { count: st.count })} · {t('report_avg')} {symbol}{avgPerApt.toLocaleString()}</Text>
                              </View>
                            </View>
                            <View style={s.barTrack}>
                              <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: st.staffColor }]} />
                            </View>
                          </View>
                        </View>
                      )
                    })}
                  </View>

                  {staff.length > 0 && (
                    <View style={s.topCard}>
                      <Ionicons name="ribbon-outline" size={20} color="#7C3AED" />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={s.topCardLabel}>{t('report_top_staff')}</Text>
                        <Text style={s.topCardName}>{staff[0].staffName}</Text>
                      </View>
                      <Text style={[s.topCardVal, { color: '#7C3AED' }]}>{symbol}{staff[0].revenue.toLocaleString()}</Text>
                    </View>
                  )}

                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>{t('report_total_revenue')}</Text>
                    <Text style={s.totalVal}>{symbol}{staff.reduce((a, st) => a + st.revenue, 0).toLocaleString()}</Text>
                  </View>
                </>
              )}
            </>
          )}

          <View style={{ height: dockPad }} />
        </ScrollView>
      )}
    </View>
  )
}

function ReportCard({ label, value, iconName, color, bg, locked }: { label: string; value: string; iconName: string; color: string; bg: string; locked?: boolean }) {
  return (
    <View style={[rc.card, { backgroundColor: '#fff', opacity: locked ? 0.55 : 1 }]}>
      <View style={[rc.icon, { backgroundColor: bg }]}>
        {locked
          ? <Ionicons name="lock-closed" size={18} color="#9CA3AF" />
          : <Ionicons name={iconName as any} size={22} color={color} />
        }
      </View>
      <Text style={rc.label}>{label}</Text>
      <Text style={[rc.value, { color: locked ? '#9CA3AF' : color }]}>{value}</Text>
    </View>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 60 }}>
      <Ionicons name="bar-chart-outline" size={48} color="#E5E7EB" />
      <Text style={{ color: '#9CA3AF', marginTop: 12, fontSize: 14 }}>{text}</Text>
    </View>
  )
}

function RaporlarSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [pulseAnim])
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {[1,2,3,4].map(i => (
          <Animated.View key={i} style={[s.skeletonCard, { width: '47%', opacity: pulseAnim }]}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#E5E7EB', marginBottom: 10 }} />
            <View style={{ width: '60%', height: 13, borderRadius: 6, backgroundColor: '#E5E7EB', marginBottom: 6 }} />
            <View style={{ width: '40%', height: 20, borderRadius: 8, backgroundColor: '#E5E7EB' }} />
          </Animated.View>
        ))}
      </View>
      {[1,2].map(i => (
        <Animated.View key={i} style={[s.skeletonCard, { opacity: pulseAnim }]}>
          <View style={{ width: '50%', height: 13, borderRadius: 6, backgroundColor: '#E5E7EB', marginBottom: 10 }} />
          <View style={{ width: '100%', height: 10, borderRadius: 5, backgroundColor: '#E5E7EB', marginBottom: 8 }} />
          <View style={{ width: '80%', height: 10, borderRadius: 5, backgroundColor: '#E5E7EB' }} />
        </Animated.View>
      ))}
    </View>
  )
}

const rc = StyleSheet.create({
  card: { width: '47.5%', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  icon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  label: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  value: { fontSize: 18, fontWeight: '800' },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  header: { backgroundColor: '#7C3AED', paddingBottom: 0, paddingHorizontal: 16, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16 },
  tabBar: { flexDirection: 'row', gap: 6, paddingBottom: 16 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  tabBtnActive: { backgroundColor: '#fff' },
  tabTxt: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  tabTxtActive: { color: '#7C3AED' },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  pdfBtnTxt: { color: '#7C3AED', fontWeight: '700', fontSize: 13 },
  periodBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  customRangeTxt: { fontSize: 11, color: '#7C3AED', fontWeight: '600', marginLeft: 4 },
  customModal: { flex: 1, backgroundColor: '#F9FAFB' },
  customModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  customModalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  customModalBody: { padding: 20 },
  customLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  customInput: { backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 16 },
  applyBtn: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  applyTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  periodBtnActive: { backgroundColor: '#7C3AED' },
  periodTxt: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  periodTxtActive: { color: '#fff' },
  body: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 8, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  bigCard: { borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20 },
  bigCardLabel: { fontSize: 13, color: '#6B7280', marginBottom: 6 },
  bigCardVal: { fontSize: 32, fontWeight: '900' },
  bigCardSub: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  barCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, gap: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waRow: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 13, fontWeight: '600', color: '#374151', width: 44 },
  barTrack: { flex: 1, height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barVal: { fontSize: 13, fontWeight: '700', color: '#111827', width: 80, textAlign: 'right' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  itemRevenue: { fontSize: 14, fontWeight: '800', color: '#111827', textAlign: 'right' },
  itemSub: { fontSize: 11, color: '#9CA3AF', textAlign: 'right' },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginTop: 2, flexShrink: 0 },
  topCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  topCardLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  topCardName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  topCardVal: { fontSize: 18, fontWeight: '900', color: '#D97706' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#7C3AED', borderRadius: 14, padding: 16, marginBottom: 20 },
  totalLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  totalVal: { fontSize: 20, fontWeight: '900', color: '#fff' },

  upgradeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F3FF', borderRadius: 16, padding: 16, marginHorizontal: 16, marginTop: 12, borderWidth: 1.5, borderColor: '#DDD6FE' },
  upgradeBoxLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  upgradeBoxTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  upgradeBoxSub: { fontSize: 12, color: '#6B7280' },
  upgradeBoxBadge: { backgroundColor: '#7C3AED', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  upgradeBoxBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },

  tabLockWrap: { flex: 1, position: 'relative', minHeight: 400 },
})
