import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Platform, Animated, Easing, Pressable,
  Alert,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useDockPad } from '@/lib/useDockPad'
import { usePreferences } from '@/lib/usePreferences'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, DashboardStats, Product, Customer, PlanUsage } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { useTenantId } from '@/lib/useTenantId'
import { useTrial } from '@/lib/useTrial'
import { useTranslation } from 'react-i18next'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

const STATUS_COLOR: Record<string, string> = {
  BEKLIYOR: '#F59E0B', ONAYLANDI: '#3B82F6',
  TAMAMLANDI: '#10B981', IPTAL: '#EF4444', GELMEDI: '#6B7280',
}
const STATUS_BG: Record<string, string> = {
  BEKLIYOR: '#FEF3C7', ONAYLANDI: '#EFF6FF',
  TAMAMLANDI: '#D1FAE5', IPTAL: '#FEE2E2', GELMEDI: '#F3F4F6',
}
const STATUS_ICON: Record<string, string> = {
  BEKLIYOR: 'time-outline', ONAYLANDI: 'checkmark-circle-outline',
  TAMAMLANDI: 'checkmark-done-circle', IPTAL: 'close-circle', GELMEDI: 'person-remove-outline',
}
const STATUS_LABEL_KEYS: Record<string, string> = {
  BEKLIYOR: 'status_BEKLIYOR', ONAYLANDI: 'status_ONAYLANDI',
  TAMAMLANDI: 'status_TAMAMLANDI', IPTAL: 'status_IPTAL', GELMEDI: 'status_GELMEDI',
}

export default function Dashboard() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const dockPad = useDockPad()
  const { currencySymbol: symbol } = usePreferences()
  const trial = useTrial()
  const queryClient = useQueryClient()
  const tenantId = useTenantId()
  const [userName, setUserName] = useState('')
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)

  const { data: dashData, isLoading: loading, refetch: refetchDash } = useQuery({
    queryKey: queryKeys.dashboard(tenantId),
    enabled: !!tenantId,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const [data, { data: { user } }, products, usageData, notifs, readIdsRaw, allCustomers, tenantProfile] = await Promise.all([
        api.dashboard.stats(),
        supabase.auth.getUser(),
        api.products.list().catch(() => [] as Product[]),
        api.tenant.usage().catch(() => null),
        api.notifications.list().catch(() => []),
        AsyncStorage.getItem('read_notification_ids').catch(() => null),
        api.customers.list().catch(() => [] as Customer[]),
        api.tenant.get().catch(() => null),
      ])
      setUserName(tenantProfile?.name || (user?.email?.split('@')[0] ?? ''))
      const readIds: Set<string> = readIdsRaw ? new Set(JSON.parse(readIdsRaw)) : new Set()
      setUnreadNotifCount(notifs.filter((n: { isNew: boolean; id: string }) => n.isNew && !readIds.has(n.id)).length)
      return { stats: data, usageData, lowStockProducts: products.filter((p: Product) => p.isActive && p.quantity <= p.minQuantity), birthdayCustomers: allCustomers.filter((c: Customer) => {
        if (!c.birthday) return false
        const today = new Date()
        const bd = new Date(c.birthday)
        const thisYear = new Date(today.getFullYear(), bd.getMonth(), bd.getDate())
        const diff = (thisYear.getTime() - today.getTime()) / 86400000
        return diff >= 0 && diff <= 7
      }), tenantProfile }
    },
    staleTime: 60 * 1000,
  })

  const stats = dashData?.stats ?? null
  const usage = dashData?.usageData ?? null
  const lowStockProducts = dashData?.lowStockProducts ?? []
  const birthdayCustomers = dashData?.birthdayCustomers ?? []

  const [refreshing, setRefreshing] = useState(false)
  const [showFabMenu, setShowFabMenu] = useState(false)
  const [autoRefreshing, setAutoRefreshing] = useState(false)
  const fabAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(0.4)).current
  const spinAnim = useRef(new Animated.Value(0)).current
  const autoRefreshLoop = useRef<ReturnType<typeof Animated.loop> | null>(null)
  const lastLoadedAt = useRef<number>(0)

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulseAnim])

  const startSpinAnim = useCallback(() => {
    spinAnim.setValue(0)
    autoRefreshLoop.current = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
    )
    autoRefreshLoop.current.start()
  }, [spinAnim])

  const stopSpinAnim = useCallback(() => {
    autoRefreshLoop.current?.stop()
    spinAnim.setValue(0)
  }, [spinAnim])

  function toggleFabMenu() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const toValue = showFabMenu ? 0 : 1
    setShowFabMenu(!showFabMenu)
    Animated.spring(fabAnim, { toValue, useNativeDriver: true, tension: 200, friction: 15 }).start()
  }

  function closeFabMenu() {
    setShowFabMenu(false)
    Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true, tension: 200, friction: 15 }).start()
  }

  // Sekmeye odaklanınca stale veri varsa yenile
  useFocusEffect(
    useCallback(() => {
      if (!tenantId) return
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(tenantId) })
    }, [tenantId, queryClient])
  )

  async function openNotifications() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.push('/bildirimler' as never)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('greeting_morning') : hour < 18 ? t('greeting_afternoon') : t('greeting_evening')
  const netProfit = stats?.netProfit ?? 0
  const revenue = stats?.revenue ?? 0
  const expense = stats?.expense ?? 0

  if (loading) return (
    <View style={s.root}>
      {/* Skeleton Hero */}
      <Animated.View style={[s.skeletonHero, { opacity: pulseAnim, paddingTop: headerPad }]}>
        <View style={s.skeletonAvatarRow}>
          <View style={s.skeletonAvatar} />
          <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
            <View style={[s.skeletonLine, { width: '40%' }]} />
            <View style={[s.skeletonLine, { width: '60%', height: 18 }]} />
          </View>
        </View>
        <View style={{ marginTop: 28, gap: 8 }}>
          <View style={[s.skeletonLine, { width: '30%', height: 52, borderRadius: 12 }]} />
          <View style={[s.skeletonLine, { width: '50%' }]} />
        </View>
      </Animated.View>
      {/* Skeleton Cards */}
      <View style={{ padding: 16, gap: 12 }}>
        <Animated.View style={[s.skeletonCard, { opacity: pulseAnim }]}>
          <View style={[s.skeletonLineGray, { width: '40%' }]} />
          <View style={[s.skeletonLineGray, { width: '60%', height: 28, marginTop: 8, borderRadius: 8 }]} />
        </Animated.View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[1, 2].map(i => (
            <Animated.View key={i} style={[s.skeletonCard, { flex: 1, opacity: pulseAnim }]}>
              <View style={[s.skeletonLineGray, { width: '50%' }]} />
              <View style={[s.skeletonLineGray, { width: '70%', height: 22, marginTop: 8, borderRadius: 8 }]} />
            </Animated.View>
          ))}
        </View>
        {[1, 2, 3].map(i => (
          <Animated.View key={i} style={[s.skeletonCard, { opacity: pulseAnim }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[s.skeletonLineGray, { width: 44, height: 44, borderRadius: 22 }]} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={[s.skeletonLineGray, { width: '55%' }]} />
                <View style={[s.skeletonLineGray, { width: '35%' }]} />
              </View>
              <View style={[s.skeletonLineGray, { width: 60, height: 24, borderRadius: 6 }]} />
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  )

  return (
    <>
      <ScrollView
        style={s.root}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await refetchDash(); setRefreshing(false) }}
            tintColor="rgba(255,255,255,0.9)"
            colors={['#7C3AED']}
            progressBackgroundColor="#fff"
          />
        }
      >
        {/* ════════════════════════════════════
            HERO
        ════════════════════════════════════ */}
        <View style={[s.hero, { paddingTop: headerPad }]}>
          {/* Dekoratif daireler */}
          <View style={s.decoCircle1} />
          <View style={s.decoCircle2} />

          {/* Üst satır */}
          <View style={s.heroTopRow}>
            <View style={s.avatarRing}>
              <View style={s.avatarBox}>
                <Text style={s.avatarTxt}>
                  {userName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'S'}
                </Text>
              </View>
              <View style={s.avatarBadge}>
                <Ionicons name="checkmark" size={9} color="#fff" />
              </View>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.greetingTxt}>{greeting}</Text>
              <Text style={s.heroName} numberOfLines={1}>{userName}</Text>
            </View>
            <TouchableOpacity style={s.notifBtn} onPress={openNotifications}>
              <Ionicons name="notifications-outline" size={22} color="#fff" />
              {unreadNotifCount > 0 && (
                <View style={s.notifBadge}>
                  <Text style={s.notifBadgeTxt}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[s.notifBtn, { marginLeft: 8 }]} onPress={() => router.push('/arama' as never)}>
              <Ionicons name="search-outline" size={22} color="#fff" />
            </TouchableOpacity>
            {autoRefreshing && (
              <Animated.View style={[s.notifBtn, { marginLeft: 8 }, {
                transform: [{
                  rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                }],
              }]}>
                <Ionicons name="refresh-outline" size={20} color="rgba(255,255,255,0.75)" />
              </Animated.View>
            )}
          </View>

          {/* Bugünün büyük sayısı */}
          <View style={s.heroBigStat}>
            <Text style={s.heroBigNum}>{stats?.today ?? 0}</Text>
            <View>
              <Text style={s.heroBigLabel}>{t('dashboard_todayCount')}</Text>
              <Text style={s.heroBigLabel}>{t('dashboard_todayAppointment')}</Text>
            </View>
          </View>

          {/* Alt satır tarih */}
          <View style={s.heroDateRow}>
            <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.65)" />
            <Text style={s.heroDateTxt}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>

          {/* Hızlı Aksiyonlar */}
          <View style={s.quickActions}>
            <QuickAction iconName="add-circle-outline" label={t('dashboard_quickAction_appointment')} onPress={() => router.push('/randevu/yeni' as never)} />
            <QuickAction iconName="people-outline" label={t('dashboard_quickAction_customers')} onPress={() => router.push('/(tabs)/customers')} />
            <QuickAction iconName="wallet-outline" label={t('dashboard_quickAction_finance')} onPress={() => router.push('/finans')} />
            <QuickAction iconName="bar-chart-outline" label={t('dashboard_quickAction_reports')} onPress={() => router.push('/raporlar')} />
          </View>
        </View>

        {/* Eğimli geçiş */}
        <View style={s.heroTail} />

        {/* Deneme / abonelik bitiş banner */}
        {(trial.isTrialActive || (trial.isSubscriptionActive && trial.daysLeft <= 7)) && (
          <TouchableOpacity
            style={[s.trialBanner, trial.daysLeft === 0 && s.trialBannerDanger]}
            onPress={() => router.push('/abonelik' as never)}
            activeOpacity={0.88}
          >
            <View style={[s.trialIconWrap, trial.daysLeft === 0 ? { backgroundColor: '#FEE2E2' } : { backgroundColor: '#FEF3C7' }]}>
              <Ionicons
                name={trial.daysLeft === 0 ? 'warning' : 'time-outline'}
                size={20}
                color={trial.daysLeft === 0 ? '#DC2626' : '#D97706'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.trialBannerTitle, trial.daysLeft === 0 && { color: '#DC2626' }]}>
                {trial.isSubscriptionActive
                  ? trial.daysLeft === 0
                    ? t('trial_sub_today', { hours: trial.hoursLeft })
                    : t('trial_sub_days', { days: trial.daysLeft })
                  : trial.daysLeft === 0
                    ? t('trial_active_today', { hours: trial.hoursLeft })
                    : t('trial_active_days', { days: trial.daysLeft })}
              </Text>
              <Text style={[s.trialBannerSub, trial.daysLeft === 0 && { color: '#DC2626' }]}>
                {trial.isSubscriptionActive ? t('trial_banner_sub_subscription') : t('trial_banner_sub_trial')}
              </Text>
            </View>
            <View style={[s.trialBannerArrow, trial.daysLeft === 0 ? { backgroundColor: '#DC2626' } : { backgroundColor: '#D97706' }]}>
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        {/* ════════════════════════════════════
            İSTATİSTİK KAYDIRMALI SATIRI
        ════════════════════════════════════ */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.statScroll}
        >
          <MiniStatCard
            iconName="calendar" label={t('dashboard_monthAppointments')}
            value={String(stats?.month ?? 0)}
            sub={t('dashboard_customers', { count: stats?.customersCount ?? 0 })}
            color="#7C3AED" bg="#EDE9FE"
          />
          <MiniStatCard
            iconName="trending-up" label={t('dashboard_monthRevenue')}
            value={`${symbol}${revenue.toLocaleString()}`}
            color="#10B981" bg="#D1FAE5"
          />
          <MiniStatCard
            iconName="trending-down" label={t('dashboard_monthExpense')}
            value={`${symbol}${expense.toLocaleString()}`}
            color="#EF4444" bg="#FEE2E2"
          />
          <MiniStatCard
            iconName={netProfit >= 0 ? 'wallet' : 'wallet-outline'}
            label={t('netProfit')}
            value={`${netProfit >= 0 ? '+' : '-'}${symbol}${Math.abs(netProfit).toLocaleString()}`}
            color={netProfit >= 0 ? '#10B981' : '#EF4444'}
            bg={netProfit >= 0 ? '#D1FAE5' : '#FEE2E2'}
          />
        </ScrollView>

        {/* Plan limit uyarı kartı */}
        {usage && (() => {
          const items: { label: string; pct: number; icon: string }[] = []
          if (usage.maxAppointmentsPerMonth && usage.pct.appointments >= 80)
            items.push({ label: t('quick_appointment'), pct: usage.pct.appointments, icon: 'calendar-outline' })
          if (usage.maxCustomers && usage.pct.customers >= 80)
            items.push({ label: t('quick_customer'), pct: usage.pct.customers, icon: 'people-outline' })
          if (usage.maxStaff && usage.pct.staff >= 100)
            items.push({ label: t('quick_staff'), pct: usage.pct.staff, icon: 'person-outline' })
          if (items.length === 0) return null
          const isFull = items.some(i => i.pct >= 100)
          const accent = isFull ? '#DC2626' : '#D97706'
          const bgCard = isFull ? '#FFF5F5' : '#FFFBEB'
          const bgBar = isFull ? '#FEE2E2' : '#FEF3C7'
          return (
            <TouchableOpacity
              style={[s.limitCard, { backgroundColor: bgCard, borderColor: isFull ? '#FECACA' : '#FDE68A' }]}
              onPress={() => router.push('/abonelik' as never)}
              activeOpacity={0.88}
            >
              <View style={[s.limitCardIcon, { backgroundColor: isFull ? '#FEE2E2' : '#FEF3C7' }]}>
                <Ionicons name={isFull ? 'lock-closed' : 'alert-circle'} size={22} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.limitCardTitle, { color: accent }]}>
                  {isFull ? t('plan_limit_reached') : t('plan_limit_near')}
                </Text>
                <View style={{ gap: 6, marginTop: 8 }}>
                  {items.map(item => (
                    <View key={item.label} style={{ gap: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name={item.icon as never} size={11} color={accent} />
                          <Text style={[s.limitCardBarLabel, { color: accent }]}>{item.label}</Text>
                        </View>
                        <Text style={[s.limitCardBarLabel, { color: accent }]}>{Math.min(item.pct, 100)}%</Text>
                      </View>
                      <View style={[s.limitBarTrack, { backgroundColor: bgBar }]}>
                        <View style={[s.limitBarFill, { width: `${Math.min(item.pct, 100)}%` as never, backgroundColor: accent }]} />
                      </View>
                    </View>
                  ))}
                </View>
                <View style={s.limitCardFooter}>
                  <Text style={[s.limitCardUpgrade, { color: accent }]}>{t('plan_upgrade_btn')}</Text>
                  <Ionicons name="arrow-forward" size={12} color={accent} />
                </View>
              </View>
            </TouchableOpacity>
          )
        })()}

        {/* ════════════════════════════════════
            BUGÜNÜN RANDEVULARI
        ════════════════════════════════════ */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <View style={s.sectionTitleRow}>
              <View style={s.sectionDot} />
              <Text style={s.sectionTitle}>{t('dashboard_todayAppointments')}</Text>
            </View>
            <TouchableOpacity style={s.seeAllBtn} onPress={() => router.push('/(tabs)/appointments')}>
              <Text style={s.seeAllTxt}>{t('dashboard_seeAll')}</Text>
              <Ionicons name="chevron-forward" size={14} color="#7C3AED" />
            </TouchableOpacity>
          </View>

          {(stats?.recentAppointments ?? []).length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIconBox}>
                <Ionicons name="calendar-outline" size={28} color="#C4B5FD" />
              </View>
              <Text style={s.emptyTitle}>{t('dashboard_noAppointments')}</Text>
              <Text style={s.emptySub}>{t('dashboard_noAppointmentsSub')}</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/(tabs)/appointments')}>
                <Ionicons name="add" size={16} color="#7C3AED" />
                <Text style={s.emptyBtnTxt}>{t('dashboard_addAppointment')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            stats?.recentAppointments.map((apt, idx) => (
              <View key={apt.id} style={[s.aptCard, idx === 0 && { marginTop: 0 }]}>
                {/* Sol renk çubuğu */}
                <View style={[s.aptBar, { backgroundColor: apt.service.color ?? '#7C3AED' }]} />

                {/* İkon */}
                <View style={[s.aptIcon, { backgroundColor: (apt.service.color ?? '#7C3AED') + '20' }]}>
                  <Ionicons name="cut-outline" size={16} color={apt.service.color ?? '#7C3AED'} />
                </View>

                {/* İçerik */}
                <View style={s.aptBody}>
                  <View style={s.aptTopRow}>
                    <Text style={s.aptName} numberOfLines={1}>{apt.customer.name}</Text>
                    <View style={[s.statusPill, { backgroundColor: STATUS_BG[apt.status] }]}>
                      <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[apt.status] }]} />
                      <Text style={[s.statusLabel, { color: STATUS_COLOR[apt.status] }]}>
                        {t(STATUS_LABEL_KEYS[apt.status])}
                      </Text>
                    </View>
                  </View>
                  <View style={s.aptBottomRow}>
                    <Text style={s.aptService} numberOfLines={1}>
                      {apt.service.name}{apt.staff ? ` · ${apt.staff.name}` : ''}
                    </Text>
                    <View style={s.aptTimeChip}>
                      <Ionicons name="time-outline" size={11} color="#9CA3AF" />
                      <Text style={s.aptTimeTxt}>{apt.startTime}</Text>
                    </View>
                  </View>
                </View>

                {/* Fiyat */}
                <Text style={s.aptPrice}>{symbol}{apt.price.toLocaleString()}</Text>
              </View>
            ))
          )}
        </View>

        {/* ════════════════════════════════════
            DOĞUM GÜNÜ HATIRLATICI
        ════════════════════════════════════ */}
        {birthdayCustomers.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHead}>
              <View style={s.sectionTitleRow}>
                <View style={[s.sectionDot, { backgroundColor: '#EC4899' }]} />
                <Text style={s.sectionTitle}>{t('dashboard_birthdays')}</Text>
              </View>
              <TouchableOpacity style={s.seeAllBtn} onPress={() => router.push('/(tabs)/customers')}>
                <Text style={s.seeAllTxt}>{t('dashboard_seeAll')}</Text>
                <Ionicons name="chevron-forward" size={14} color={PURPLE} />
              </TouchableOpacity>
            </View>
            <View style={s.bdCard}>
              {birthdayCustomers.map(c => {
                const bd = new Date(c.birthday!)
                const today = new Date()
                const thisYear = new Date(today.getFullYear(), bd.getMonth(), bd.getDate())
                const diff = Math.round((thisYear.getTime() - today.getTime()) / 86400000)
                const label = diff === 0 ? t('dashboard_birthdayToday') : t('dashboard_birthdayDays', { count: diff })
                return (
                  <TouchableOpacity key={c.id} style={s.bdRow} onPress={() => router.push(`/musteri/${c.id}` as never)}>
                    <View style={s.bdAvatar}>
                      <Text style={s.bdAvatarTxt}>{c.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bdName}>{c.name}</Text>
                      <Text style={s.bdPhone}>{c.phone}</Text>
                    </View>
                    <View style={[s.bdBadge, diff === 0 && { backgroundColor: '#FCE7F3' }]}>
                      <Text style={[s.bdBadgeTxt, diff === 0 && { color: '#BE185D' }]}>{label}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        {/* ════════════════════════════════════
            KRİTİK STOK UYARISI
        ════════════════════════════════════ */}
        {lowStockProducts.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHead}>
              <View style={s.sectionTitleRow}>
                <View style={[s.sectionDot, { backgroundColor: '#DC2626' }]} />
                <Text style={s.sectionTitle}>{t('dashboard_stockAlert')}</Text>
              </View>
              <TouchableOpacity style={s.seeAllBtn} onPress={() => router.push('/stok' as never)}>
                <Text style={s.seeAllTxt}>{t('dashboard_goToStock')}</Text>
                <Ionicons name="chevron-forward" size={14} color="#7C3AED" />
              </TouchableOpacity>
            </View>
            <View style={s.stockAlertCard}>
              <View style={s.stockAlertHeader}>
                <View style={s.stockAlertIconWrap}>
                  <Ionicons name="warning-outline" size={20} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stockAlertTitle}>{t('dashboard_stockCount', { count: lowStockProducts.length })}</Text>
                  <Text style={s.stockAlertSub}>{t('dashboard_stockSub')}</Text>
                </View>
              </View>
              {lowStockProducts.slice(0, 3).map(p => (
                <View key={p.id} style={s.stockAlertRow}>
                  <View style={[s.stockDot, { backgroundColor: p.quantity === 0 ? '#DC2626' : '#D97706' }]} />
                  <Text style={s.stockAlertName} numberOfLines={1}>{p.name}</Text>
                  <View style={[s.stockQtyBadge, { backgroundColor: p.quantity === 0 ? '#FEF2F2' : '#FEF3C7' }]}>
                    <Text style={[s.stockQtyTxt, { color: p.quantity === 0 ? '#DC2626' : '#D97706' }]}>
                      {p.quantity === 0 ? t('dashboard_stockOut') : `${p.quantity} ${p.unit}`}
                    </Text>
                  </View>
                </View>
              ))}
              {lowStockProducts.length > 3 && (
                <Text style={s.stockMoreTxt}>{t('dashboard_stockMore', { count: lowStockProducts.length - 3 })}</Text>
              )}
            </View>
          </View>
        )}

        <View style={{ height: dockPad }} />
      </ScrollView>

      {/* FAB overlay backdrop */}
      {showFabMenu && (
        <TouchableOpacity style={s.fabBackdrop} activeOpacity={1} onPress={closeFabMenu} />
      )}

      {/* FAB seçenekleri */}
      <Animated.View style={[s.fabOption, {
        opacity: fabAnim,
        transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -64] }) }],
      }]}>
        <TouchableOpacity style={s.fabOptionBtn} onPress={() => { closeFabMenu(); router.push('/(tabs)/customers') }} activeOpacity={0.85}>
          <View style={[s.fabOptionIcon, { backgroundColor: '#059669' }]}><Ionicons name="person-add-outline" size={18} color="#fff" /></View>
          <Text style={s.fabOptionTxt}>{t('dashboard_fab_newCustomer')}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[s.fabOption, {
        opacity: fabAnim,
        transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -124] }) }],
      }]}>
        <TouchableOpacity style={s.fabOptionBtn} onPress={() => { closeFabMenu(); router.push('/randevu/yeni' as never) }} activeOpacity={0.85}>
          <View style={[s.fabOptionIcon, { backgroundColor: '#2563EB' }]}><Ionicons name="calendar-outline" size={18} color="#fff" /></View>
          <Text style={s.fabOptionTxt}>{t('dashboard_fab_newAppointment')}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[s.fabOption, {
        opacity: fabAnim,
        transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -184] }) }],
      }]}>
        <TouchableOpacity style={s.fabOptionBtn} onPress={() => { closeFabMenu(); router.push('/finans?modal=gelir' as never) }} activeOpacity={0.85}>
          <View style={[s.fabOptionIcon, { backgroundColor: '#10B981' }]}><Ionicons name="arrow-up-circle-outline" size={18} color="#fff" /></View>
          <Text style={s.fabOptionTxt}>{t('dashboard_fab_addRevenue')}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[s.fabOption, {
        opacity: fabAnim,
        transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -244] }) }],
      }]}>
        <TouchableOpacity style={s.fabOptionBtn} onPress={() => { closeFabMenu(); router.push('/finans?modal=gider' as never) }} activeOpacity={0.85}>
          <View style={[s.fabOptionIcon, { backgroundColor: '#EF4444' }]}><Ionicons name="arrow-down-circle-outline" size={18} color="#fff" /></View>
          <Text style={s.fabOptionTxt}>{t('dashboard_fab_addExpense')}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[s.fabOption, {
        opacity: fabAnim,
        transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -304] }) }],
      }]}>
        <TouchableOpacity style={s.fabOptionBtn} onPress={() => { closeFabMenu(); router.push('/stok' as never) }} activeOpacity={0.85}>
          <View style={[s.fabOptionIcon, { backgroundColor: '#EA580C' }]}><Ionicons name="cube-outline" size={18} color="#fff" /></View>
          <Text style={s.fabOptionTxt}>{t('dashboard_fab_stockMovement')}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[s.fabOption, {
        opacity: fabAnim,
        transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -364] }) }],
      }]}>
        <TouchableOpacity style={s.fabOptionBtn} onPress={() => { closeFabMenu(); router.push('/(tabs)/customers') }} activeOpacity={0.85}>
          <View style={[s.fabOptionIcon, { backgroundColor: '#7C3AED' }]}><Ionicons name="document-text-outline" size={18} color="#fff" /></View>
          <Text style={s.fabOptionTxt}>{t('dashboard_fab_quickNote')}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* FAB ana buton */}
      <TouchableOpacity style={s.fab} onPress={toggleFabMenu} activeOpacity={0.85}>
        <Animated.View style={{ transform: [{ rotate: fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
          <Ionicons name="add" size={28} color="#fff" />
        </Animated.View>
      </TouchableOpacity>
    </>
  )
}

function QuickAction({ iconName, label, onPress }: { iconName: IoniconsName; label: string; onPress: () => void }) {
  const scale     = useRef(new Animated.Value(1)).current
  const iconScale = useRef(new Animated.Value(1)).current
  const iconY     = useRef(new Animated.Value(0)).current

  const handlePressIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale,     { toValue: 0.90, useNativeDriver: true, tension: 500, friction: 8 }),
      Animated.spring(iconScale, { toValue: 0.80, useNativeDriver: true, tension: 500, friction: 8 }),
      Animated.timing(iconY,     { toValue: 2, duration: 80, useNativeDriver: true }),
    ]).start()
  }, [])

  const handlePressOut = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale,     { toValue: 1,  useNativeDriver: true, tension: 300, friction: 6 }),
      Animated.sequence([
        Animated.spring(iconScale, { toValue: 1.25, useNativeDriver: true, tension: 400, friction: 5 }),
        Animated.spring(iconScale, { toValue: 1,    useNativeDriver: true, tension: 300, friction: 8 }),
      ]),
      Animated.sequence([
        Animated.spring(iconY, { toValue: -6, useNativeDriver: true, tension: 400, friction: 5 }),
        Animated.spring(iconY, { toValue: 0,  useNativeDriver: true, tension: 300, friction: 8 }),
      ]),
    ]).start()
  }, [])

  return (
    <Pressable
      style={s.qaBtn}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Animated.View style={[s.qaIcon, { transform: [{ scale: iconScale }, { translateY: iconY }] }]}>
          <Ionicons name={iconName} size={20} color="#fff" />
        </Animated.View>
      </Animated.View>
      <Text style={s.qaLabel}>{label}</Text>
    </Pressable>
  )
}

function MiniStatCard({ iconName, label, value, sub, color, bg }: {
  iconName: IoniconsName; label: string; value: string; sub?: string; color: string; bg: string
}) {
  return (
    <View style={s.miniCard}>
      <View style={[s.miniIcon, { backgroundColor: bg }]}>
        <Ionicons name={iconName} size={18} color={color} />
      </View>
      <Text style={[s.miniValue, { color }]}>{value}</Text>
      <Text style={s.miniLabel}>{label}</Text>
      {sub && <Text style={s.miniSub}>{sub}</Text>}
    </View>
  )
}

const PURPLE = '#7C3AED'
const PURPLE_DARK = '#5B21B6'

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Splash / Skeleton
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F4F8', gap: 0 },
  splashIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center' },
  splashTxt: { marginTop: 12, fontSize: 13, color: '#9CA3AF' },
  skeletonHero: {
    backgroundColor: PURPLE,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  skeletonAvatarRow: { flexDirection: 'row', alignItems: 'center' },
  skeletonAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.25)' },
  skeletonLine: { height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.25)' },
  skeletonLineGray: { height: 14, borderRadius: 7, backgroundColor: '#E5E7EB' },
  skeletonCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  // ── HERO ──────────────────────────────────────────────────
  hero: {
    backgroundColor: PURPLE,
    paddingHorizontal: 20,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  decoCircle1: {
    position: 'absolute', width: 220, height: 220,
    borderRadius: 110, backgroundColor: PURPLE_DARK,
    opacity: 0.35, top: -60, right: -60,
  },
  decoCircle2: {
    position: 'absolute', width: 140, height: 140,
    borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: 60, left: -30,
  },

  // Üst satır
  heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  avatarRing: {
    width: 50, height: 50, borderRadius: 25,
    borderWidth: 2.5, borderColor: '#2DD4BF',
    justifyContent: 'center', alignItems: 'center',
    padding: 2,
  },
  avatarBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#2DD4BF',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#7C3AED',
  },
  avatarTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  greetingTxt: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  heroName: { fontSize: 17, fontWeight: '800', color: '#fff', textTransform: 'capitalize' },
  notifBtn: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  notifBadge: {
    position: 'absolute', top: -3, right: -3,
    backgroundColor: '#EF4444', borderRadius: 10,
    minWidth: 18, height: 18,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: PURPLE,
  },
  notifBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Bugünün büyük sayısı
  heroBigStat: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  heroBigNum: { fontSize: 72, fontWeight: '900', color: '#fff', lineHeight: 80 },
  heroBigLabel: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.75)', lineHeight: 24 },

  // Tarih
  heroDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 24 },
  heroDateTxt: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },

  // Hızlı aksiyonlar
  quickActions: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, padding: 16, marginHorizontal: 0, marginBottom: 0,
  },
  qaBtn: { alignItems: 'center', gap: 8, flex: 1 },
  qaIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  qaLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)', textAlign: 'center' },

  trialBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFBEB', borderWidth: 1.5, borderColor: '#FDE68A',
    marginHorizontal: 16, marginTop: 14, borderRadius: 16, padding: 14,
    shadowColor: '#D97706', shadowOpacity: 0.12, shadowRadius: 8, elevation: 2,
  },
  trialBannerDanger: {
    backgroundColor: '#FEF2F2', borderColor: '#FECACA',
    shadowColor: '#DC2626',
  },
  trialIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  trialBannerTitle: { fontSize: 13, fontWeight: '800', color: '#D97706', marginBottom: 2 },
  trialBannerSub: { fontSize: 11.5, color: '#92400E', fontWeight: '500' },
  trialBannerArrow: {
    width: 24, height: 24, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },

  // Hero tail (curved bottom)
  heroTail: {
    height: 28, backgroundColor: PURPLE,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
  },

  // ── STAT CARDS ────────────────────────────────────────────
  statScroll: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  miniCard: {
    width: 140, backgroundColor: '#fff', borderRadius: 18,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  miniIcon: {
    width: 38, height: 38, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  miniValue: { fontSize: 20, fontWeight: '900', marginBottom: 2 },
  miniLabel: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  miniSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  // ── SECTION ───────────────────────────────────────────────
  section: { paddingHorizontal: 16, marginTop: 4 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 4, height: 18, borderRadius: 2, backgroundColor: PURPLE },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllTxt: { fontSize: 13, fontWeight: '600', color: PURPLE },

  // Empty state
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 28,
    alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  emptyIconBox: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EDE9FE', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 20, marginTop: 8,
  },
  emptyBtnTxt: { color: PURPLE, fontWeight: '700', fontSize: 13 },

  // Appointment cards
  aptCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 18,
    marginTop: 8, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    paddingRight: 14, paddingVertical: 2,
  },
  aptBar: { width: 4, alignSelf: 'stretch', minHeight: 68 },
  aptIcon: {
    width: 38, height: 38, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    marginHorizontal: 12,
  },
  aptBody: { flex: 1, paddingVertical: 14 },
  aptTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  aptName: { fontSize: 14, fontWeight: '800', color: '#111827', flex: 1, marginRight: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusLabel: { fontSize: 10, fontWeight: '700' },
  aptBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aptService: { fontSize: 12, color: '#9CA3AF', flex: 1 },
  aptTimeChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  aptTimeTxt: { fontSize: 12, color: '#9CA3AF' },
  aptPrice: { fontSize: 14, fontWeight: '900', color: '#111827', marginLeft: 10 },

  // ── NOTIFICATIONS MODAL ───────────────────────────────────
  notifModal: { flex: 1, backgroundColor: '#F9FAFB' },
  notifHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16,
    paddingHorizontal: 20, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  notifTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  notifSub: { fontSize: 12, color: PURPLE, fontWeight: '600', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  notifEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  notifEmptyTxt: { fontSize: 15, color: '#9CA3AF' },
  notifRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    gap: 12, backgroundColor: '#fff',
  },
  notifRowNew: { backgroundColor: '#FAFAFE' },
  notifIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  notifInfo: { flex: 1 },
  notifCustomer: { fontSize: 14, fontWeight: '700', color: '#111827' },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PURPLE },
  notifService: { fontSize: 13, color: '#6B7280', marginBottom: 6 },
  notifTime: { fontSize: 11, color: '#9CA3AF' },
  fab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 114 : 100, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center', shadowColor: '#7C3AED', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8, zIndex: 100 },
  fabBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 },
  fabOption: { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 114 : 100, zIndex: 95 },
  fabOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-end' },
  fabOptionIcon: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  fabOptionTxt: { fontSize: 13, fontWeight: '700', color: '#111827', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },

  bdCard: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  bdRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#FDF2F8' },
  bdAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FCE7F3', justifyContent: 'center', alignItems: 'center' },
  bdAvatarTxt: { fontSize: 16, fontWeight: '800', color: '#BE185D' },
  bdName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  bdPhone: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  bdBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  bdBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#6B7280' },

  stockAlertCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: '#FECACA', shadowColor: '#DC2626', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  stockAlertHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  stockAlertIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center' },
  stockAlertTitle: { fontSize: 14, fontWeight: '800', color: '#DC2626', marginBottom: 2 },
  stockAlertSub: { fontSize: 12, color: '#9CA3AF' },
  stockAlertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#FEF2F2' },
  stockDot: { width: 8, height: 8, borderRadius: 4 },
  stockAlertName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
  stockQtyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  stockQtyTxt: { fontSize: 11, fontWeight: '700' },
  stockMoreTxt: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 8, fontWeight: '600' },
  limitBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', marginHorizontal: 16, marginTop: 10, borderRadius: 14, padding: 12 },
  limitBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 2 },
  limitBannerSub: { fontSize: 12, color: '#B45309' },
  limitCard: { flexDirection: 'row', gap: 14, marginHorizontal: 16, marginBottom: 8, borderRadius: 18, borderWidth: 1.5, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  limitCardIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  limitCardTitle: { fontSize: 14, fontWeight: '800' },
  limitCardBarLabel: { fontSize: 11, fontWeight: '600' },
  limitBarTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  limitBarFill: { height: 6, borderRadius: 3 },
  limitCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  limitCardUpgrade: { fontSize: 12, fontWeight: '700' },
})
