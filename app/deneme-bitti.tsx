import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Easing, Alert, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useTrial } from '@/lib/useTrial'
import {
  getOfferings, purchasePackage, restorePurchases,
  isAnyPaidActive, type PurchaseResult,
} from '@/lib/purchases'
import type { PurchasesPackage } from 'react-native-purchases'
import { useTranslation } from 'react-i18next'
import { detectCountry, getPricing, formatPrice } from '@/lib/pricing'

type PlanMeta = {
  labelKey: string; color: string; bg: string
  icon: 'rocket-outline' | 'flash-outline' | 'business-outline'
  featureKeys: string[]
  popular?: boolean
}

const PLAN_META: Record<string, PlanMeta> = {
  baslangic_monthly: {
    labelKey: 'plan_BASLANGIC_label', color: '#2563EB', bg: '#EFF6FF', icon: 'rocket-outline',
    featureKeys: ['plan_mini_baslangic_f1', 'plan_mini_baslangic_f2', 'plan_mini_baslangic_f3'],
  },
  profesyonel_monthly: {
    labelKey: 'plan_PROFESYONEL_label', color: '#7C3AED', bg: '#EDE9FE', icon: 'flash-outline',
    popular: true,
    featureKeys: ['plan_mini_profesyonel_f1', 'plan_mini_profesyonel_f2', 'plan_mini_profesyonel_f3'],
  },
  isletme_monthly: {
    labelKey: 'plan_ISLETME_label', color: '#D97706', bg: '#FEF3C7', icon: 'business-outline',
    featureKeys: ['plan_mini_isletme_f1', 'plan_mini_isletme_f2', 'plan_mini_isletme_f3'],
  },
}

export default function DenemeBitti() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const trial = useTrial()

  const [packages, setPackages]   = useState<PurchasesPackage[]>([])
  const [loadingPkgs, setLoadingPkgs] = useState(true)
  const [purchasing, setPurchasing]   = useState<string | null>(null)
  const [restoring, setRestoring]     = useState(false)
  const [preferredPlanId, setPreferredPlanId] = useState<string | null>(null)
  const [pricing, setPricing] = useState<ReturnType<typeof getPricing> | null>(null)

  const pulse  = useRef(new Animated.Value(1)).current
  const fadeIn = useRef(new Animated.Value(0)).current

  const isSubExpired = trial.lockReason === 'subscription_expired'
  const title    = isSubExpired ? t('sub_ended_title') : t('trial_ended_title')
  const subtitle = isSubExpired ? t('sub_ended_sub') : t('trial_ended_sub')

  const BENEFITS = [
    t('trial_benefit_1'),
    t('trial_benefit_2'),
    t('trial_benefit_3'),
  ]

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start()
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start()
    AsyncStorage.getItem('selected_plan').then(p => { if (p) setPreferredPlanId(p) })
    detectCountry().then(c => setPricing(getPricing(c)))
    loadPackages()
  }, [])

  async function loadPackages() {
    setLoadingPkgs(true)
    const pkgs = await getOfferings()
    setPackages(pkgs)
    setLoadingPkgs(false)
  }

  async function handlePurchase(pkg: PurchasesPackage) {
    setPurchasing(pkg.identifier)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const result: PurchaseResult = await purchasePackage(pkg)
    setPurchasing(null)

    if (result.success) {
      if (isAnyPaidActive(result.customerInfo)) {
        await AsyncStorage.removeItem('selected_plan')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert(t('trial_welcome_title'), t('trial_welcome_msg'), [
          { text: t('continue'), onPress: () => router.replace('/(tabs)') },
        ])
      }
    } else if (!result.cancelled) {
      Alert.alert(t('trial_purchase_failed'), result.error)
    }
  }

  async function handleRestore() {
    setRestoring(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const result = await restorePurchases()
    setRestoring(false)

    if (result.success && isAnyPaidActive(result.customerInfo)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('trial_restored_title'), t('trial_restored_msg'), [
        { text: t('continue'), onPress: () => router.replace('/(tabs)') },
      ])
    } else {
      Alert.alert(t('trial_not_found_title'), t('trial_not_found_msg'))
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  const displayPackages = packages.length > 0
    ? preferredPlanId
      ? [...packages].sort((a, b) => a.identifier === preferredPlanId ? -1 : b.identifier === preferredPlanId ? 1 : 0)
      : packages
    : null

  return (
    <Animated.ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={[s.iconWrap, { transform: [{ scale: pulse }], opacity: fadeIn }]}>
        <View style={s.iconCircle}>
          <Ionicons name="lock-closed" size={40} color="#7C3AED" />
        </View>
        <View style={s.iconBadge}>
          <Ionicons name="time-outline" size={14} color="#DC2626" />
        </View>
      </Animated.View>

      <Animated.View style={[s.body, { opacity: fadeIn }]}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>{subtitle}</Text>

        <View style={s.benefitBox}>
          {BENEFITS.map(b => (
            <View key={b} style={s.benefitRow}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={s.benefitTxt}>{b}</Text>
            </View>
          ))}
        </View>

        {isSubExpired && trial.profile && packages.length > 0 && (() => {
          const currentPlanKey = trial.profile!.plan.toLowerCase() + '_monthly'
          const currentPkg = packages.find(p => p.identifier === currentPlanKey)
          if (!currentPkg) return null
          const meta = PLAN_META[currentPkg.identifier]
          return (
            <TouchableOpacity
              style={[s.renewBtn, { backgroundColor: meta?.color ?? '#7C3AED' }]}
              onPress={() => handlePurchase(currentPkg)}
              disabled={!!purchasing}
              activeOpacity={0.88}
            >
              {purchasing === currentPkg.identifier
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="refresh-outline" size={18} color="#fff" />
                    <Text style={s.renewBtnTxt}>
                      {t('trial_renew_plan', { label: t(meta?.labelKey ?? ''), price: currentPkg.product.priceString })}
                    </Text>
                  </>
              }
            </TouchableOpacity>
          )
        })()}

        {loadingPkgs ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color="#7C3AED" />
            <Text style={s.loadingTxt}>{t('trial_loading_plans')}</Text>
          </View>
        ) : displayPackages ? (
          displayPackages.map(pkg => {
            const meta = PLAN_META[pkg.identifier]
            if (!meta) return null
            const isBuying = purchasing === pkg.identifier
            return (
              <View key={pkg.identifier} style={[s.planCard, (meta.popular || pkg.identifier === preferredPlanId) && { borderColor: meta.color, borderWidth: 2 }]}>
                {pkg.identifier === preferredPlanId ? (
                  <View style={[s.popularBadge, { backgroundColor: meta.color }]}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={s.popularTxt}>Seçtiğiniz Plan</Text>
                  </View>
                ) : meta.popular ? (
                  <View style={[s.popularBadge, { backgroundColor: meta.color }]}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={s.popularTxt}>{t('trial_most_popular')}</Text>
                  </View>
                ) : null}

                <View style={s.planTop}>
                  <View style={[s.planIcon, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={22} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planName}>{t(meta.labelKey)}</Text>
                    <Text style={[s.planPrice, { color: meta.color }]}>
                      {pkg.product.priceString}
                      <Text style={s.planPer}>/ay</Text>
                    </Text>
                  </View>
                </View>

                <View style={s.featList}>
                  {meta.featureKeys.map(fk => (
                    <View key={fk} style={s.featRow}>
                      <View style={[s.featDot, { backgroundColor: meta.color }]} />
                      <Text style={s.featTxt}>{t(fk)}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[s.buyBtn, { backgroundColor: meta.color }, isBuying && { opacity: 0.7 }]}
                  onPress={() => handlePurchase(pkg)}
                  disabled={!!purchasing}
                  activeOpacity={0.88}
                >
                  {isBuying
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.buyBtnTxt}>{t('trial_select_plan', { price: pkg.product.priceString })}</Text>
                  }
                </TouchableOpacity>
              </View>
            )
          })
        ) : pricing ? (
          // RevenueCat yokken fiyat listesi göster
          [
            { key: 'BASLANGIC', labelKey: 'plan_BASLANGIC_label', color: '#2563EB', bg: '#EFF6FF', icon: 'rocket-outline' as const, featureKeys: ['plan_BASLANGIC_f1','plan_BASLANGIC_f2','plan_BASLANGIC_f3'] },
            { key: 'PROFESYONEL', labelKey: 'plan_PROFESYONEL_label', color: '#7C3AED', bg: '#EDE9FE', icon: 'flash-outline' as const, popular: true, featureKeys: ['plan_PROFESYONEL_f1','plan_PROFESYONEL_f2','plan_PROFESYONEL_f3'] },
            { key: 'ISLETME', labelKey: 'plan_ISLETME_label', color: '#D97706', bg: '#FEF3C7', icon: 'business-outline' as const, featureKeys: ['plan_ISLETME_f1','plan_ISLETME_f2','plan_ISLETME_f3'] },
          ].map(plan => {
            const priceKey: Record<string, 'starter' | 'professional' | 'business'> = { BASLANGIC: 'starter', PROFESYONEL: 'professional', ISLETME: 'business' }
            const price = pricing[priceKey[plan.key]]
            const isPreferred = preferredPlanId === plan.key.toLowerCase() + '_monthly'
            return (
              <View key={plan.key} style={[s.planCard, (plan.popular || isPreferred) && { borderColor: plan.color, borderWidth: 2 }]}>
                {isPreferred ? (
                  <View style={[s.popularBadge, { backgroundColor: plan.color }]}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={s.popularTxt}>{t('sub_selected_plan')}</Text>
                  </View>
                ) : plan.popular ? (
                  <View style={[s.popularBadge, { backgroundColor: plan.color }]}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={s.popularTxt}>{t('trial_most_popular')}</Text>
                  </View>
                ) : null}
                <View style={s.planTop}>
                  <View style={[s.planIcon, { backgroundColor: plan.bg }]}>
                    <Ionicons name={plan.icon} size={22} color={plan.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planName}>{t(plan.labelKey)}</Text>
                    <Text style={[s.planPrice, { color: plan.color }]}>
                      {formatPrice(price as number, pricing.symbol)}<Text style={s.planPer}>/ay</Text>
                    </Text>
                  </View>
                </View>
                <View style={s.featList}>
                  {plan.featureKeys.map(fk => (
                    <View key={fk} style={s.featRow}>
                      <View style={[s.featDot, { backgroundColor: plan.color }]} />
                      <Text style={s.featTxt}>{t(fk)}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={[s.buyBtn, { backgroundColor: plan.color }]}
                  onPress={() => Alert.alert(t('sub_store_title'), t('sub_store_msg'))}
                  activeOpacity={0.88}
                >
                  <Text style={s.buyBtnTxt}>{formatPrice(price as number, pricing.symbol)}/ay {t('sub_upgrade_btn')}</Text>
                </TouchableOpacity>
              </View>
            )
          })
        ) : null}

        <TouchableOpacity style={s.restoreBtn} onPress={handleRestore} disabled={restoring}>
          {restoring
            ? <ActivityIndicator color="#7C3AED" size="small" />
            : <Text style={s.restoreTxt}>{t('trial_restore_btn')}</Text>
          }
        </TouchableOpacity>

        <Text style={s.legalTxt}>{t('trial_legal')}</Text>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={16} color="#9CA3AF" />
          <Text style={s.logoutTxt}>{t('trial_logout_btn')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF8FF' },
  content: { paddingHorizontal: 20, alignItems: 'center' },
  body: { width: '100%', alignItems: 'center' },

  iconWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 24, position: 'relative' },
  iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#DDD6FE' },
  iconBadge: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },

  title: { fontSize: 26, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 10 },
  sub: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 20 },

  benefitBox: { width: '100%', backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, marginBottom: 20, gap: 8 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitTxt: { fontSize: 13, color: '#065F46', fontWeight: '500', flex: 1 },

  renewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', borderRadius: 16, padding: 16, marginBottom: 16 },
  renewBtnTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  loadingWrap: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  loadingTxt: { fontSize: 14, color: '#9CA3AF' },

  planCard: { width: '100%', backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  popularBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 10 },
  popularTxt: { fontSize: 11, color: '#fff', fontWeight: '800' },

  planTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  planIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  planName: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 2 },
  planPrice: { fontSize: 20, fontWeight: '900' },
  planPer: { fontSize: 12, fontWeight: '500', color: '#9CA3AF' },

  featList: { gap: 6, marginBottom: 14 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featDot: { width: 6, height: 6, borderRadius: 3 },
  featTxt: { fontSize: 13, color: '#374151' },

  buyBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  buyBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  notConfigured: { alignItems: 'center', gap: 10, backgroundColor: '#F9FAFB', borderRadius: 14, padding: 24, width: '100%', borderWidth: 1, borderColor: '#E5E7EB' },
  notConfiguredTxt: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },

  restoreBtn: { paddingVertical: 14, marginTop: 4 },
  restoreTxt: { fontSize: 14, color: '#7C3AED', fontWeight: '600' },

  legalTxt: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 16, marginTop: 12, marginBottom: 8, paddingHorizontal: 8 },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12 },
  logoutTxt: { fontSize: 13, color: '#9CA3AF' },
})
