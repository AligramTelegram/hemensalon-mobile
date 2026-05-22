import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Platform,
  ScrollView, Modal, Linking,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { api, staffApi, Customer, Service } from '@/lib/api'
import { useTranslation } from 'react-i18next'

const STATUS_COLOR: Record<string, string> = {
  BEKLIYOR: '#D97706', ONAYLANDI: '#2563EB',
  TAMAMLANDI: '#059669', IPTAL: '#DC2626', GELMEDI: '#6B7280',
}
const STATUS_LABEL_KEYS: Record<string, string> = {
  BEKLIYOR: 'status_BEKLIYOR', ONAYLANDI: 'status_ONAYLANDI',
  TAMAMLANDI: 'status_TAMAMLANDI', IPTAL: 'status_IPTAL', GELMEDI: 'status_GELMEDI',
}

const COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2']
function stringToColor(str: string) { return COLORS[str.charCodeAt(0) % COLORS.length] }

type Tab = 'customers' | 'services'

export default function StaffMusteriler() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('customers')

  const load = useCallback(async (q?: string) => {
    try {
      const [c, sv] = await Promise.all([
        staffApi.customers.list(q),
        staffApi.services.list(),
      ])
      setCustomers(c)
      setServices(sv.filter(s => s.isActive))
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const timer = setTimeout(() => load(search || undefined), 350)
    return () => clearTimeout(timer)
  }, [search, load])

  async function openCustomer(c: Customer) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setDetailLoading(true)
    setSelectedCustomer(c)
    try {
      const detail = await api.customers.get(c.id)
      setSelectedCustomer(detail)
    } catch {}
    setDetailLoading(false)
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  )

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <Text style={s.heroTitle}>{t('staff_salon_info')}</Text>
        <Text style={s.heroSub}>{t('staff_salon_info_sub')}</Text>

        {/* Sekme */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tab, activeTab === 'customers' && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setActiveTab('customers') }}
          >
            <Ionicons name="people-outline" size={15} color={activeTab === 'customers' ? '#7C3AED' : 'rgba(255,255,255,0.7)'} />
            <Text style={[s.tabTxt, activeTab === 'customers' && s.tabTxtActive]}>{t('nav_customers')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'services' && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setActiveTab('services') }}
          >
            <Ionicons name="cut-outline" size={15} color={activeTab === 'services' ? '#7C3AED' : 'rgba(255,255,255,0.7)'} />
            <Text style={[s.tabTxt, activeTab === 'services' && s.tabTxtActive]}>{t('hizmetler_title')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={s.heroCurve} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#7C3AED" size="large" /></View>
      ) : activeTab === 'services' ? (
        /* ── Hizmetler ── */
        <FlatList
          data={services}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}
          ListEmptyComponent={<Text style={s.empty}>{t('services_empty')}</Text>}
          renderItem={({ item }) => (
            <View style={s.serviceRow}>
              <View style={[s.serviceColorDot, { backgroundColor: item.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.serviceName}>{item.name}</Text>
                <Text style={s.serviceMeta}>{t('duration_min_short', { min: item.duration })}</Text>
              </View>
              <Text style={s.servicePrice}>₺{(item.price ?? 0).toLocaleString()}</Text>
            </View>
          )}
        />
      ) : (
        /* ── Müşteriler ── */
        <>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={17} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              style={s.searchInput}
              placeholder={t('customer_searchPlaceholder')}
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}
            ListEmptyComponent={<Text style={s.empty}>{t('customer_empty')}</Text>}
            renderItem={({ item }) => {
              const color = stringToColor(item.name)
              const initials = item.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
              return (
                <TouchableOpacity style={s.customerRow} onPress={() => openCustomer(item)}>
                  <View style={[s.avatar, { backgroundColor: color + '20' }]}>
                    <Text style={[s.avatarTxt, { color }]}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.customerName}>{item.name}</Text>
                    <Text style={s.customerPhone}>{item.phone}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={s.visitCount}>{t('customer_visitsCount', { count: item.totalVisits })}</Text>
                    {(item.totalSpent ?? 0) > 0 && <Text style={s.spent}>₺{(item.totalSpent ?? 0).toLocaleString()}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              )
            }}
          />
        </>
      )}

      {/* Müşteri detay modal */}
      <Modal visible={!!selectedCustomer} animationType="slide" presentationStyle="pageSheet">
        {selectedCustomer && (
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <View style={[s.modalAvatar, { backgroundColor: stringToColor(selectedCustomer.name) + '20' }]}>
                <Text style={[s.modalAvatarTxt, { color: stringToColor(selectedCustomer.name) }]}>
                  {selectedCustomer.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={s.modalName}>{selectedCustomer.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.modalPhone}>{selectedCustomer.phone}</Text>
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${selectedCustomer.phone}`)} style={s.callBtn}>
                    <Ionicons name="call" size={13} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={() => setSelectedCustomer(null)}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              {/* İstatistikler */}
              <View style={s.statsRow}>
                <View style={s.statCard}>
                  <Text style={s.statNum}>{selectedCustomer.totalVisits ?? 0}</Text>
                  <Text style={s.statLabel}>{t('staff_stat_visit')}</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={[s.statNum, { color: '#059669' }]}>₺{(selectedCustomer.totalSpent ?? 0).toLocaleString()}</Text>
                  <Text style={s.statLabel}>{t('staff_stat_spent')}</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={s.statNum}>
                    {selectedCustomer.lastVisitAt
                      ? Math.floor((Date.now() - new Date(selectedCustomer.lastVisitAt).getTime()) / 86400000) + 'g'
                      : '—'}
                  </Text>
                  <Text style={s.statLabel}>{t('staff_stat_last_visit')}</Text>
                </View>
              </View>

              {/* Bilgiler */}
              {selectedCustomer.email && (
                <InfoRow icon="mail-outline" label={t('email')} value={selectedCustomer.email} />
              )}
              {selectedCustomer.birthday && (
                <InfoRow icon="gift-outline" label={t('birthday')} value={
                  new Date(selectedCustomer.birthday).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
                } />
              )}
              {selectedCustomer.notes && (
                <InfoRow icon="document-text-outline" label={t('notes')} value={selectedCustomer.notes} />
              )}

              {/* Yeni randevu butonu */}
              <TouchableOpacity
                style={s.newAptBtn}
                onPress={() => {
                  setSelectedCustomer(null)
                  router.push(`/randevu/yeni?customerId=${selectedCustomer.id}` as never)
                }}
              >
                <Ionicons name="calendar-outline" size={18} color="#fff" />
                <Text style={s.newAptTxt}>{t('appointments_create')}</Text>
              </TouchableOpacity>

              {/* Son randevular */}
              {detailLoading ? (
                <ActivityIndicator color="#7C3AED" style={{ marginTop: 20 }} />
              ) : selectedCustomer.appointments && selectedCustomer.appointments.length > 0 && (
                <>
                  <Text style={s.sectionLabel}>{t('staff_recent_apts')}</Text>
                  {selectedCustomer.appointments.slice(0, 5).map(apt => (
                    <View key={apt.id} style={s.aptRow}>
                      <View style={[s.aptDot, { backgroundColor: apt.service.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.aptService}>{apt.service.name}</Text>
                        <Text style={s.aptDate}>
                          {new Date(apt.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}{apt.startTime}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 3 }}>
                        <Text style={s.aptPrice}>₺{(apt.price ?? 0).toLocaleString()}</Text>
                        <Text style={[s.aptStatus, { color: STATUS_COLOR[apt.status] ?? '#6B7280' }]}>
                          {t(STATUS_LABEL_KEYS[apt.status] ?? 'unknown')}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={ir.wrap}>
      <Ionicons name={icon as any} size={16} color="#7C3AED" style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={ir.label}>{label}</Text>
        <Text style={ir.value}>{value}</Text>
      </View>
    </View>
  )
}
const ir = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  label: { fontSize: 11, color: '#9CA3AF' },
  value: { fontSize: 14, color: '#111827', lineHeight: 20 },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  hero: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 20,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  heroCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16 },

  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  tabActive: { backgroundColor: '#fff' },
  tabTxt: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  tabTxtActive: { color: '#7C3AED' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 12, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E5E7EB' },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 12 },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 48, fontSize: 14 },

  customerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarTxt: { fontSize: 16, fontWeight: '800' },
  customerName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  customerPhone: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  visitCount: { fontSize: 12, color: '#6B7280' },
  spent: { fontSize: 12, fontWeight: '700', color: '#059669' },

  serviceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  serviceColorDot: { width: 14, height: 14, borderRadius: 7 },
  serviceName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  serviceMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  servicePrice: { fontSize: 15, fontWeight: '800', color: '#7C3AED' },

  // Modal
  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 20, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalAvatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  modalAvatarTxt: { fontSize: 20, fontWeight: '900' },
  modalName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalPhone: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  callBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  statNum: { fontSize: 20, fontWeight: '900', color: '#111827' },
  statLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },

  newAptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', borderRadius: 14, padding: 16, marginTop: 20, marginBottom: 24 },
  newAptTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  aptRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  aptDot: { width: 10, height: 10, borderRadius: 5 },
  aptService: { fontSize: 14, fontWeight: '600', color: '#111827' },
  aptDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  aptPrice: { fontSize: 13, fontWeight: '700', color: '#111827' },
  aptStatus: { fontSize: 11, fontWeight: '600' },
})
