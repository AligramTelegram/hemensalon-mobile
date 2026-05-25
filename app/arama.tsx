import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { api, Customer, Appointment, Service } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { usePreferences } from '@/lib/usePreferences'

const PURPLE = '#7C3AED'

const STATUS_LABEL_KEYS: Record<string, string> = {
  BEKLIYOR: 'status_pending', ONAYLANDI: 'status_confirmed',
  TAMAMLANDI: 'status_completed', IPTAL: 'status_cancelled', GELMEDI: 'status_noshow',
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionHeaderTxt}>{title.toUpperCase()}</Text>
    </View>
  )
}

function CustomerRow({ item, onPress }: { item: Customer; onPress: () => void }) {
  const { t } = useTranslation()
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75}>
      <View style={s.avatar}>
        <Text style={s.avatarTxt}>{getInitials(item.name)}</Text>
      </View>
      <View style={s.rowBody}>
        <Text style={s.rowTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={s.rowSub} numberOfLines={1}>{item.phone}</Text>
      </View>
      <View style={s.visitBadge}>
        <Ionicons name="checkmark-circle" size={12} color={PURPLE} />
        <Text style={s.visitTxt}>{t('customer_visitsCount', { count: item.totalVisits })}</Text>
      </View>
    </TouchableOpacity>
  )
}

function AppointmentRow({ item, onPress }: { item: Appointment; onPress: () => void }) {
  const { t } = useTranslation()
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.aptBar, { backgroundColor: item.service.color ?? PURPLE }]} />
      <View style={s.rowBody}>
        <Text style={s.rowTitle} numberOfLines={1}>{item.customer.name}</Text>
        <Text style={s.rowSub} numberOfLines={1}>{item.service.name}</Text>
      </View>
      <View style={s.aptMeta}>
        <Text style={s.aptDate}>{formatDate(item.date)}</Text>
        <Text style={s.aptTime}>{item.startTime}</Text>
        <Text style={s.aptStatus}>{t(STATUS_LABEL_KEYS[item.status] ?? 'status_pending')}</Text>
      </View>
    </TouchableOpacity>
  )
}

function ServiceRow({ item, onPress, currencySymbol }: { item: Service; onPress: () => void; currencySymbol: string }) {
  const { t } = useTranslation()
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.colorDot, { backgroundColor: item.color ?? PURPLE }]} />
      <View style={s.rowBody}>
        <Text style={s.rowTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={s.rowSub}>{item.duration} {t('min_abbr')}</Text>
      </View>
      <Text style={s.servicePrice}>{currencySymbol}{item.price.toLocaleString()}</Text>
    </TouchableOpacity>
  )
}

function EmptyState() {
  const { t } = useTranslation()
  return (
    <View style={s.emptyWrap}>
      <View style={s.emptyIconBox}>
        <Ionicons name="search-outline" size={32} color="#C4B5FD" />
      </View>
      <Text style={s.emptyTitle}>{t('search_empty')}</Text>
      <Text style={s.emptySub}>{t('search_no_results_sub')}</Text>
    </View>
  )
}

function Hint() {
  const { t } = useTranslation()
  return (
    <View style={s.emptyWrap}>
      <View style={s.emptyIconBox}>
        <Ionicons name="search" size={32} color="#C4B5FD" />
      </View>
      <Text style={s.emptyTitle}>{t('search_hint_title')}</Text>
      <Text style={s.emptySub}>{t('search_hint_sub')}</Text>
    </View>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AramaScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const { currencySymbol } = usePreferences()
  const inputRef = useRef<TextInput>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Service[]>([])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCustomers([])
      setAppointments([])
      setServices([])
      setSearched(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setSearched(false)

    try {
      const [cust, apts, svcs] = await Promise.all([
        api.customers.list({ q }).then(r => r.data).catch(() => [] as Customer[]),
        api.appointments.list({ q }).catch(() => [] as Appointment[]),
        api.services.list().catch(() => [] as Service[]),
      ])

      const filteredSvcs = svcs.filter(sv =>
        sv.name.toLowerCase().includes(q.toLowerCase())
      )

      setCustomers(cust.slice(0, 5))
      setAppointments(apts.slice(0, 5))
      setServices(filteredSvcs.slice(0, 5))
    } catch {
      setCustomers([])
      setAppointments([])
      setServices([])
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }, [])

  function handleChangeText(text: string) {
    setQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(text)
    }, 300)
  }

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => {
      clearTimeout(timer)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const hasResults = customers.length > 0 || appointments.length > 0 || services.length > 0
  const showEmpty = searched && !loading && !hasResults && query.trim().length > 0

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: headerPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={s.input}
          placeholder={t('search')}
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={handleChangeText}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {loading && (
          <ActivityIndicator size="small" color={PURPLE} style={{ marginLeft: 8 }} />
        )}
      </View>

      <ScrollView
        style={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {!searched && !loading && <Hint />}
        {showEmpty && <EmptyState />}

        {customers.length > 0 && (
          <View style={s.section}>
            <SectionHeader title={t('search_customers')} />
            {customers.map(item => (
              <CustomerRow
                key={item.id}
                item={item}
                onPress={() => router.push(`/musteri/${item.id}` as never)}
              />
            ))}
          </View>
        )}

        {appointments.length > 0 && (
          <View style={s.section}>
            <SectionHeader title={t('search_appointments')} />
            {appointments.map(item => (
              <AppointmentRow
                key={item.id}
                item={item}
                onPress={() => router.push(`/(tabs)/appointments?date=${item.date?.split('T')[0] ?? ''}` as never)}
              />
            ))}
          </View>
        )}

        {services.length > 0 && (
          <View style={s.section}>
            <SectionHeader title={t('hizmetler_title')} />
            {services.map(item => (
              <ServiceRow
                key={item.id}
                item={item}
                currencySymbol={currencySymbol}
                onPress={() => router.push('/hizmetler' as never)}
              />
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 42,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingTop: 8 },

  section: { marginBottom: 8 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionHeaderTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowBody: { flex: 1, marginHorizontal: 12 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  rowSub: { fontSize: 12, color: '#9CA3AF' },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTxt: { fontSize: 14, fontWeight: '800', color: PURPLE },

  visitBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  visitTxt: { fontSize: 11, fontWeight: '600', color: PURPLE },

  aptBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 50 },
  aptMeta: { alignItems: 'flex-end', gap: 2 },
  aptDate: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  aptTime: { fontSize: 12, color: '#111827', fontWeight: '700' },
  aptStatus: { fontSize: 10, color: '#9CA3AF' },

  colorDot: { width: 14, height: 14, borderRadius: 7 },
  servicePrice: { fontSize: 14, fontWeight: '800', color: '#111827' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
})
