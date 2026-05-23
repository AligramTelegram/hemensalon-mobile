import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking, Alert, Platform,
} from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, TenantProfile } from '@/lib/api'
import { detectCountry, getPricing, formatPrice } from '@/lib/pricing'
import { useTrial } from '@/lib/useTrial'
import { getOfferings, purchasePackage, restorePurchases, isAnyPaidActive } from '@/lib/purchases'
import type { PurchasesPackage } from 'react-native-purchases'
import { useTranslation } from 'react-i18next'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

type PlanDef = {
  key: string
  labelKey: string
  color: string
  bg: string
  icon: IoniconsName
  featureKeys: string[]
  missingKeys: string[]
  smsKey: string
  mailKey: string
  popular?: boolean
}

const PLANS: PlanDef[] = [
  {
    key: 'BASLANGIC',
    labelKey: 'plan_BASLANGIC_label',
    color: '#2563EB',
    bg: '#EFF6FF',
    icon: 'rocket-outline',
    featureKeys: ['plan_BASLANGIC_f1', 'plan_BASLANGIC_f2', 'plan_BASLANGIC_f3', 'plan_BASLANGIC_f4'],
    missingKeys: ['plan_BASLANGIC_m1', 'plan_BASLANGIC_m2', 'plan_BASLANGIC_m3', 'plan_BASLANGIC_m4'],
    smsKey: 'plan_BASLANGIC_sms',
    mailKey: 'plan_mail_unlimited',
  },
  {
    key: 'PROFESYONEL',
    labelKey: 'plan_PROFESYONEL_label',
    color: '#7C3AED',
    bg: '#EDE9FE',
    icon: 'flash-outline',
    popular: true,
    featureKeys: ['plan_PROFESYONEL_f1', 'plan_PROFESYONEL_f2', 'plan_PROFESYONEL_f3', 'plan_PROFESYONEL_f4', 'plan_PROFESYONEL_f5'],
    missingKeys: ['plan_PROFESYONEL_m1', 'plan_PROFESYONEL_m2'],
    smsKey: 'plan_PROFESYONEL_sms',
    mailKey: 'plan_mail_unlimited',
  },
  {
    key: 'ISLETME',
    labelKey: 'plan_ISLETME_label',
    color: '#D97706',
    bg: '#FEF3C7',
    icon: 'business-outline',
    featureKeys: ['plan_ISLETME_f1', 'plan_ISLETME_f2', 'plan_ISLETME_f3', 'plan_ISLETME_f4', 'plan_ISLETME_f5', 'plan_ISLETME_f6'],
    missingKeys: [],
    smsKey: 'plan_ISLETME_sms',
    mailKey: 'plan_mail_unlimited',
  },
]

export default function Abonelik() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const trial = useTrial()
  const [profile, setProfile] = useState<TenantProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [symbol, setSymbol] = useState('₺')
  const [prices, setPrices] = useState({ starter: 599.99, professional: 1299.99, business: 1799.99 })
  const [packages, setPackages] = useState<PurchasesPackage[]>([])
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, country] = await Promise.all([api.tenant.get(), detectCountry()])
      setProfile(p)
      const pr = getPricing(country)
      setSymbol(pr.symbol)
      setPrices({ starter: pr.starter, professional: pr.professional, business: pr.business })
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load()
    getOfferings().then(setPackages)
  }, [load])

async function handleUpgrade(planKey: string) {
    if (planKey === profile?.plan) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    const PLAN_TO_PACKAGE: Record<string, string> = {
      BASLANGIC:   'hemensalon_starter_monthly',
      PROFESYONEL: 'hemensalon_professional_monthly',
      ISLETME:     'hemensalon_business_monthly',
    }
    const pkgId = PLAN_TO_PACKAGE[planKey]
    const pkg = packages.find(p => p.identifier === pkgId)

    if (pkg) {
      setPurchasing(planKey)
      const result = await purchasePackage(pkg)
      setPurchasing(null)
      if (result.success && isAnyPaidActive(result.customerInfo)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert('🎉', t('sub_purchase_success'), [
          { text: t('ok'), onPress: () => load() },
        ])
      } else if (!result.success) {
        Alert.alert(t('sub_purchase_failed'))
      }
    } else {
      const planLabel = t(PLANS.find(p => p.key === planKey)?.labelKey ?? '')
      Alert.alert(
        t('sub_change_plan_title'),
        t('sub_change_plan_msg', { label: planLabel }),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('ok'), style: 'default' },
        ]
      )
    }
  }

  async function handleRestore() {
    setRestoring(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const result = await restorePurchases()
    setRestoring(false)
    if (result.success && isAnyPaidActive(result.customerInfo)) {
      Alert.alert(t('sub_restored_title'), t('sub_restored_msg'))
      load()
    } else {
      Alert.alert(t('sub_not_found_title'), t('sub_not_found_msg'))
    }
  }

  const currentPlan = PLANS.find(p => p.key === profile?.plan) ?? PLANS[0]
  const planEndsAt = profile?.planEndsAt ? new Date(profile.planEndsAt) : null
  const daysLeft = planEndsAt ? Math.ceil((planEndsAt.getTime() - Date.now()) / 86400000) : null

  const planPrice = (key: string) => {
    if (key === 'BASLANGIC') return formatPrice(prices.starter, symbol)
    if (key === 'PROFESYONEL') return formatPrice(prices.professional, symbol)
    return formatPrice(prices.business, symbol)
  }

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { backgroundColor: currentPlan.color, paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <View style={s.heroContent}>
          <View style={[s.planIconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name={currentPlan.icon} size={18} color="#fff" />
          </View>
          <Text style={s.heroLabel}>{t('sub_current_plan')}</Text>
          <Text style={s.heroTitle}>{t(currentPlan.labelKey)}</Text>
          {daysLeft !== null && (
            <View style={s.daysLeftBadge}>
              <Ionicons name="calendar-outline" size={12} color="#fff" />
              <Text style={s.daysLeftTxt}>
                {daysLeft > 0 ? t('sub_days_left', { days: daysLeft }) : t('sub_expired')}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={[s.heroCurve, { backgroundColor: currentPlan.color }]} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color={currentPlan.color} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 108 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={currentPlan.color} />}
        >
          {(trial.isTrialActive || trial.isSubscriptionActive) && (
            <View style={[s.trialCard, trial.isSubscriptionActive && { backgroundColor: '#F0FDF4', borderColor: '#A7F3D0' }]}>
              <View style={s.trialCardTop}>
                <Ionicons
                  name={trial.isSubscriptionActive ? 'checkmark-circle-outline' : 'hourglass-outline'}
                  size={20}
                  color={trial.isSubscriptionActive ? '#059669' : '#D97706'}
                />
                <Text style={[s.trialCardTitle, trial.isSubscriptionActive && { color: '#065F46' }]}>
                  {trial.isSubscriptionActive ? t('sub_subscription_active') : t('sub_trial_active')}
                </Text>
                <View style={[s.trialDaysBadge, trial.isSubscriptionActive && { backgroundColor: '#D1FAE5', borderColor: '#A7F3D0' }]}>
                  <Text style={[s.trialDaysTxt, trial.isSubscriptionActive && { color: '#059669' }]}>
                    {t('sub_time_left', { val: trial.daysLeft > 0 ? `${trial.daysLeft} ${t('time_day')}` : `${trial.hoursLeft} ${t('time_hour')}` })}
                  </Text>
                </View>
              </View>
              {trial.endsAt && (
                <Text style={[s.trialEndDate, trial.isSubscriptionActive && { color: '#065F46' }]}>
                  {t('sub_ends_at', { date: trial.endsAt.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) })}
                </Text>
              )}
              <View style={s.trialBar}>
                <View style={[
                  s.trialBarFill,
                  trial.isSubscriptionActive && { backgroundColor: '#059669' },
                  { width: `${Math.max(3, trial.isSubscriptionActive ? (trial.daysLeft / 30) * 100 : (trial.daysLeft / 3) * 100)}%` as any },
                ]} />
              </View>
              <Text style={[s.trialCardSub, trial.isSubscriptionActive && { color: '#065F46' }]}>
                {trial.isSubscriptionActive
                  ? trial.daysLeft <= 7
                    ? t('sub_trial_ending_soon')
                    : t('sub_subscription_ok')
                  : t('sub_trial_warning')}
              </Text>
            </View>
          )}

          {profile?.isTurkish && (
            <View style={s.usageCard}>
              <Text style={s.sectionTitle}>{t('sub_usage_title')}</Text>
              <View style={s.usageRow}>
                <UsageStat icon="chatbubble-ellipses-outline" label="SMS" value={`${profile.smsUsed ?? 0}/${(profile.smsMonthlyLimit ?? 0) + (profile.smsCredits ?? 0)}`} color="#2563EB" />
              </View>
            </View>
          )}


          <Text style={s.sectionTitle2}>{t('sub_plans_title')}</Text>
          {PLANS.map(plan => {
            const isCurrent = plan.key === profile?.plan
            const isDowngrade = PLANS.findIndex(p => p.key === plan.key) < PLANS.findIndex(p => p.key === profile?.plan)
            const priceStr = planPrice(plan.key)
            return (
              <View key={plan.key} style={[s.planCard, isCurrent && { borderColor: plan.color, borderWidth: 2 }]}>

                {/* Başlık satırı */}
                <View style={s.planCardHeader}>
                  <View style={s.planCardHeaderLeft}>
                    <View style={[s.planCardIcon, { backgroundColor: plan.bg }]}>
                      <Ionicons name={plan.icon} size={18} color={plan.color} />
                    </View>
                    <Text style={s.planCardName}>{t(plan.labelKey)}</Text>
                  </View>
                  {isCurrent ? (
                    <View style={[s.badgePill, { backgroundColor: plan.color + '18', borderColor: plan.color + '40' }]}>
                      <Ionicons name="checkmark" size={10} color={plan.color} />
                      <Text style={[s.badgePillTxt, { color: plan.color }]}>{t('sub_current_badge')}</Text>
                    </View>
                  ) : plan.popular ? (
                    <View style={[s.badgePill, { backgroundColor: plan.color + '18', borderColor: plan.color + '40' }]}>
                      <Text style={[s.badgePillTxt, { color: plan.color }]}>{t('sub_popular_badge')}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Fiyat */}
                <View style={s.priceRow}>
                  <Text style={s.priceMain}>{priceStr}</Text>
                  <Text style={s.pricePer}>{t('sub_per_month')}</Text>
                </View>

                {/* CTA butonu */}
                {isCurrent ? (
                  <View style={[s.planBtn, { backgroundColor: plan.color + '12' }]}>
                    <Ionicons name="checkmark-circle" size={16} color={plan.color} />
                    <Text style={[s.planBtnTxt, { color: plan.color }]}>{t('sub_current_badge')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[s.planBtn, { backgroundColor: isDowngrade ? '#F3F4F6' : plan.color }, purchasing === plan.key && { opacity: 0.7 }]}
                    onPress={() => handleUpgrade(plan.key)}
                    disabled={!!purchasing}
                    activeOpacity={0.85}
                  >
                    {purchasing === plan.key
                      ? <ActivityIndicator color={isDowngrade ? '#6B7280' : '#fff'} size="small" />
                      : <Text style={[s.planBtnTxt, { color: isDowngrade ? '#6B7280' : '#fff' }]}>
                          {isDowngrade ? t('sub_downgrade_btn') : t('sub_upgrade_btn')}
                        </Text>
                    }
                  </TouchableOpacity>
                )}

                {/* Dahil özellikler */}
                <View style={s.dividerRow}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerTxt}>{t('sub_features_included')}</Text>
                  <View style={s.dividerLine} />
                </View>

                <View style={s.featureList}>
                  {plan.featureKeys.map(fk => (
                    <View key={fk} style={s.featureRow}>
                      <Ionicons name="checkmark-circle" size={17} color="#22C55E" />
                      <Text style={s.featureTxt}>{t(fk)}</Text>
                    </View>
                  ))}
                  {profile?.isTurkish ? (
                    <View style={s.featureRow}>
                      <Ionicons name="checkmark-circle" size={17} color="#22C55E" />
                      <Text style={s.featureTxt}>{t(plan.smsKey)}</Text>
                    </View>
                  ) : (
                    <View style={s.featureRow}>
                      <Ionicons name="checkmark-circle" size={17} color="#22C55E" />
                      <Text style={s.featureTxt}>{t(plan.mailKey)}</Text>
                    </View>
                  )}
                </View>

                {/* Eksik özellikler */}
                {plan.missingKeys.length > 0 && (
                  <>
                    <View style={s.dividerRow}>
                      <View style={s.dividerLine} />
                      <Text style={s.dividerTxt}>{t('sub_features_missing')}</Text>
                      <View style={s.dividerLine} />
                    </View>
                    <View style={s.featureList}>
                      {plan.missingKeys.map(fk => (
                        <View key={fk} style={s.featureRow}>
                          <Ionicons name="close-circle" size={17} color="#F87171" />
                          <Text style={s.missingTxt}>{t(fk)}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )
          })}

          <TouchableOpacity style={s.restoreBtn} onPress={handleRestore} disabled={restoring}>
            {restoring
              ? <ActivityIndicator color="#7C3AED" size="small" />
              : <Text style={s.restoreTxt}>{t('sub_restore_btn')}</Text>
            }
          </TouchableOpacity>

          <Text style={s.legalTxt}>{t('sub_legal')}</Text>

          <View style={s.supportCard}>
            <Ionicons name="help-circle-outline" size={20} color="#7C3AED" />
            <View style={{ flex: 1 }}>
              <Text style={s.supportTitle}>{t('sub_support_title')}</Text>
              <Text style={s.supportSub}>{t('sub_support_sub')}</Text>
            </View>
            <TouchableOpacity onPress={() => Linking.openURL('mailto:destek@hemensalon.com')}>
              <Ionicons name="mail-outline" size={20} color="#7C3AED" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  )
}

function UsageStat({ icon, label, value, color }: {
  icon: IoniconsName; label: string; value: string; color: string
}) {
  return (
    <View style={s.usageStat}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={s.usageLabel}>{label}</Text>
      <Text style={[s.usageValue, { color }]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },

  hero: { paddingBottom: 16, paddingHorizontal: 20, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(0,0,0,0.1)', top: -70, right: -60 },
  decoCircle2: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -20, left: 30 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  heroContent: { alignItems: 'center' },
  planIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  heroLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  heroTitle: { fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 6 },
  daysLeftBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  daysLeftTxt: { fontSize: 12, color: '#fff', fontWeight: '700' },
  heroCurve: { height: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },

  usageCard: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 18, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  usageRow: { flexDirection: 'row', gap: 12 },
  usageStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12 },
  usageLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', flex: 1 },
  usageValue: { fontSize: 13, fontWeight: '800' },

  billingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 18, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  billingBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  billingIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  billingBtnTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  billingBtnSub: { fontSize: 12, color: '#9CA3AF' },

  sectionTitle2: { fontSize: 13, fontWeight: '700', color: '#374151', marginHorizontal: 16, marginTop: 20, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  planCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 18, padding: 18, borderWidth: 1.5, borderColor: '#F3F4F6', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },

  planCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  planCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planCardIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  planCardName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  badgePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgePillTxt: { fontSize: 11, fontWeight: '700' },

  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 14 },
  priceMain: { fontSize: 28, fontWeight: '900', color: '#111827' },
  pricePer: { fontSize: 13, color: '#9CA3AF', fontWeight: '500', marginBottom: 3 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#F3F4F6' },
  dividerTxt: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },

  featureList: { gap: 8, marginBottom: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureTxt: { fontSize: 13, color: '#374151', fontWeight: '500' },
  missingTxt: { color: '#D1D5DB' },

  planBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: 12, marginBottom: 14 },
  planBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  supportCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EDE9FE', marginHorizontal: 16, marginTop: 4, borderRadius: 18, padding: 16 },
  supportTitle: { fontSize: 14, fontWeight: '700', color: '#4C1D95', marginBottom: 2 },
  supportSub: { fontSize: 12, color: '#7C3AED' },
  restoreBtn: { alignItems: 'center', paddingVertical: 14, marginHorizontal: 16, marginTop: 4 },
  restoreTxt: { fontSize: 14, color: '#7C3AED', fontWeight: '600' },
  legalTxt: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 16, marginHorizontal: 16, marginBottom: 8 },

  trialCard: { backgroundColor: '#FFFBEB', marginHorizontal: 16, marginTop: 16, borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: '#FDE68A' },
  trialCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  trialCardTitle: { fontSize: 14, fontWeight: '800', color: '#92400E', flex: 1 },
  trialDaysBadge: { backgroundColor: '#FEF3C7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#FDE68A' },
  trialDaysTxt: { fontSize: 12, fontWeight: '800', color: '#D97706' },
  trialBar: { height: 6, backgroundColor: '#FDE68A', borderRadius: 3, marginBottom: 10 },
  trialBarFill: { height: 6, backgroundColor: '#D97706', borderRadius: 3 },
  trialCardSub: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  trialEndDate: { fontSize: 12, color: '#92400E', fontWeight: '600', marginBottom: 8 },
})
