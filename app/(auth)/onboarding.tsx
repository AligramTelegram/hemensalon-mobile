import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { getOfferings, purchasePackage, isAnyPaidActive } from '@/lib/purchases';
import type { PurchasesPackage } from 'react-native-purchases';

const { width } = Dimensions.get('window');

type SlideKey = 'rocket-outline' | 'people-outline' | 'trending-up-outline' | 'notifications-outline' | 'cut-outline' | 'layers-outline';

const SLIDE_META: { icon: SlideKey; color: string; bg: string; titleKey: string; descKey: string }[] = [
  { icon: 'calendar-outline' as any, color: '#7C3AED', bg: '#F5F3FF', titleKey: 'onboarding_s0_title', descKey: 'onboarding_s0_desc' },
  { icon: 'people-outline', color: '#2563EB', bg: '#EFF6FF', titleKey: 'onboarding_s1_title', descKey: 'onboarding_s1_desc' },
  { icon: 'trending-up-outline', color: '#059669', bg: '#ECFDF5', titleKey: 'onboarding_s2_title', descKey: 'onboarding_s2_desc' },
  { icon: 'notifications-outline', color: '#D97706', bg: '#FFFBEB', titleKey: 'onboarding_s3_title', descKey: 'onboarding_s3_desc' },
  { icon: 'cut-outline', color: '#7C3AED', bg: '#F5F3FF', titleKey: 'onboarding_s4_title', descKey: 'onboarding_s4_desc' },
  { icon: 'layers-outline', color: '#0891B2', bg: '#ECFEFF', titleKey: 'onboarding_s5_title', descKey: 'onboarding_s5_desc' },
]

const PLAN_META = [
  {
    id: 'baslangic_monthly',
    label: 'Başlangıç',
    price: '₺189',
    color: '#2563EB',
    bg: '#EFF6FF',
    icon: 'rocket-outline' as const,
    features: ['1 Personel', '100 Müşteri', '200 Randevu/ay'],
  },
  {
    id: 'profesyonel_monthly',
    label: 'Profesyonel',
    price: '₺389',
    color: '#7C3AED',
    bg: '#EDE9FE',
    icon: 'flash-outline' as const,
    features: ['3 Personel', '500 Müşteri', '1000 Randevu/ay'],
    popular: true,
  },
  {
    id: 'isletme_monthly',
    label: 'İşletme',
    price: '₺589',
    color: '#D97706',
    bg: '#FEF3C7',
    icon: 'business-outline' as const,
    features: ['10 Personel', 'Sınırsız Müşteri', 'Sınırsız Randevu'],
  },
]

export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [showPlans, setShowPlans] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const isLastSlide = current === SLIDE_META.length - 1;

  async function finish() {
    await AsyncStorage.setItem('onboarding_done', '1');
    router.replace('/(auth)/login');
  }

  async function handleShowPlans() {
    setShowPlans(true);
    const pkgs = await getOfferings();
    setPackages(pkgs);
  }

  async function handlePurchase(pkg: PurchasesPackage) {
    setPurchasing(pkg.identifier);
    const result = await purchasePackage(pkg);
    setPurchasing(null);
    if (result.success && isAnyPaidActive(result.customerInfo)) {
      await AsyncStorage.setItem('onboarding_done', '1');
      router.replace('/(auth)/login');
    }
  }

  function next() {
    if (current < SLIDE_META.length - 1) {
      const nextIdx = current + 1;
      scrollRef.current?.scrollTo({ x: nextIdx * width, animated: true });
      setCurrent(nextIdx);
    } else {
      setShowPlans(true);
      handleShowPlans();
    }
  }

  const slide = SLIDE_META[current];

  if (showPlans) {
    return (
      <View style={s.plansRoot}>
        <View style={s.plansHeader}>
          <TouchableOpacity onPress={() => setShowPlans(false)} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#7C3AED" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.plansTitle}>Planınızı Seçin</Text>
            <Text style={s.plansSub}>İlk ayınız %100 iade garantilidir</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.plansScroll} showsVerticalScrollIndicator={false}>
          {PLAN_META.map(plan => {
            const pkg = packages.find(p => p.identifier === plan.id);
            const price = pkg?.product.priceString ?? plan.price;
            const isBuying = purchasing === plan.id;
            return (
              <View key={plan.id} style={[s.planCard, plan.popular && { borderColor: plan.color, borderWidth: 2 }]}>
                {plan.popular && (
                  <View style={[s.popularBadge, { backgroundColor: plan.color }]}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={s.popularTxt}>En Popüler</Text>
                  </View>
                )}
                <View style={s.planTop}>
                  <View style={[s.planIcon, { backgroundColor: plan.bg }]}>
                    <Ionicons name={plan.icon} size={22} color={plan.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planName}>{plan.label}</Text>
                    <Text style={[s.planPrice, { color: plan.color }]}>{price}<Text style={s.planPer}>/ay</Text></Text>
                  </View>
                </View>
                <View style={s.featList}>
                  {plan.features.map(f => (
                    <View key={f} style={s.featRow}>
                      <Ionicons name="checkmark-circle" size={14} color={plan.color} />
                      <Text style={s.featTxt}>{f}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={[s.buyBtn, { backgroundColor: plan.color }, isBuying && { opacity: 0.7 }]}
                  onPress={() => pkg ? handlePurchase(pkg) : null}
                  disabled={!!purchasing || !pkg}
                  activeOpacity={0.88}
                >
                  {isBuying
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.buyBtnTxt}>Satın Al — {price}/ay</Text>
                  }
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity style={s.trialBtn} onPress={finish}>
            <Ionicons name="time-outline" size={16} color="#6B7280" />
            <Text style={s.trialBtnTxt}>3 Gün Ücretsiz Dene</Text>
          </TouchableOpacity>
          <Text style={s.legalTxt}>
            Abonelikler App Store / Google Play üzerinden yönetilir. İlk satın alma sonrası otomatik yenilenir.
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.deco1} />
      <View style={s.deco2} />

      <TouchableOpacity style={s.skipBtn} onPress={finish}>
        <Text style={s.skipTxt}>{t('onboarding_skip')}</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal pagingEnabled scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {SLIDE_META.map((sl, i) => (
          <View key={i} style={s.slide}>
            <View style={[s.slideIcon, { backgroundColor: sl.bg }]}>
              <Ionicons name={sl.icon} size={56} color={sl.color} />
            </View>
            <Text style={s.slideTitle}>{t(sl.titleKey)}</Text>
            <Text style={s.slideDesc}>{t(sl.descKey)}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.bottom}>
        <View style={s.dots}>
          {SLIDE_META.map((_, i) => (
            <View key={i} style={[s.dot, i === current && s.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={s.nextBtn} onPress={next} activeOpacity={0.85}>
          <Text style={s.nextTxt}>{isLastSlide ? 'Başla' : t('onboarding_next')}</Text>
          <Ionicons name={isLastSlide ? 'rocket-outline' : 'arrow-forward'} size={18} color="#7C3AED" />
        </TouchableOpacity>

        {isLastSlide && (
          <TouchableOpacity style={s.trialBtnInline} onPress={finish}>
            <Text style={s.trialBtnInlineTxt}>3 gün ücretsiz dene →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#7C3AED' },
  deco1: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: '#5B21B6', opacity: 0.4, top: -80, right: -60 },
  deco2: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#5B21B6', opacity: 0.25, bottom: 100, left: -50 },

  skipBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 24, right: 20, zIndex: 10, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 },
  skipTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  slide: { width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 60 },
  slideIcon: { width: 120, height: 120, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 36, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  slideTitle: { fontSize: 26, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 14, letterSpacing: -0.3 },
  slideDesc: { fontSize: 15, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 24 },

  bottom: { paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 32, paddingTop: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { width: 24, backgroundColor: '#fff' },

  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  nextTxt: { fontSize: 16, fontWeight: '800', color: '#7C3AED' },

  trialBtnInline: { alignItems: 'center', paddingTop: 16 },
  trialBtnInlineTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '600' },

  // Plan seçim ekranı
  plansRoot: { flex: 1, backgroundColor: '#F4F4F8' },
  plansHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: Platform.OS === 'ios' ? 60 : 32, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center' },
  plansTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  plansSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  plansScroll: { padding: 16, gap: 12, paddingBottom: 48 },

  planCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  popularBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 10 },
  popularTxt: { fontSize: 11, color: '#fff', fontWeight: '800' },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  planIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  planName: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 2 },
  planPrice: { fontSize: 20, fontWeight: '900' },
  planPer: { fontSize: 12, fontWeight: '500', color: '#9CA3AF' },
  featList: { gap: 6, marginBottom: 14 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featTxt: { fontSize: 13, color: '#374151' },
  buyBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  buyBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  trialBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  trialBtnTxt: { fontSize: 15, color: '#6B7280', fontWeight: '600' },
  legalTxt: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 16, paddingHorizontal: 8, marginTop: 4 },
})
