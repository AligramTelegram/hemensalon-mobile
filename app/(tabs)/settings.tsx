import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { supabase } from '@/lib/supabase'
import { getPricing } from '@/lib/pricing'
import { usePreferences } from '@/lib/usePreferences'
import { useTranslation } from 'react-i18next'

export default function Settings() {
  const { t } = useTranslation()
  const { currency, currencySymbol } = usePreferences()
  const pricing = { ...getPricing(currency === 'TRY' ? 'TR' : currency === 'USD' ? 'US' : currency === 'EUR' ? 'DE' : currency === 'GBP' ? 'GB' : 'TR'), symbol: currencySymbol }
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email ?? '')
      setLoading(false)
    }
    load()
  }, [])

  const PLAN_FEATURES: Record<string, string[]> = {
    Starter: [t('settings_plan_f1'), t('settings_plan_f2'), t('settings_plan_f3')],
    Professional: [t('settings_plan_f4'), t('settings_plan_f5'), t('settings_plan_f6'), t('settings_plan_f7')],
    Business: [t('settings_plan_f8'), t('settings_plan_f9'), t('settings_plan_f10'), t('settings_plan_f11'), t('settings_plan_f12')],
  }

  async function handleLogout() {
    Alert.alert(t('logout'), t('menu_logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'), style: 'destructive', onPress: async () => {
          setLoggingOut(true)
          await supabase.auth.signOut()
        },
      },
    ])
  }

  const packages = [
    { name: 'Starter', price: pricing.starter, color: '#06B6D4' },
    { name: 'Professional', price: pricing.professional, color: '#7C3AED', popular: true },
    { name: 'Business', price: pricing.business, color: '#F59E0B' },
  ]

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#7C3AED" /></View>
  }

  return (
    <ScrollView style={s.root} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <Text style={s.heroTitle}>{t('settings')}</Text>
      </View>

      {/* Profil */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t('menu_account')}</Text>
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{email.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileEmail}>{email}</Text>
            <Text style={s.profileSub}>{t('settings_business')}</Text>
          </View>
        </View>
      </View>

      {/* Paketler */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t('settings_upgradePackage')}</Text>
        {packages.map(pkg => (
          <View key={pkg.name} style={[s.packageCard, pkg.popular && s.packageCardPopular]}>
            {pkg.popular && (
              <View style={s.popularBadge}>
                <Text style={s.popularTxt}>{t('settings_mostPopular')}</Text>
              </View>
            )}
            <View style={s.packageTop}>
              <Text style={s.packageName}>{pkg.name}</Text>
              <View>
                <Text style={[s.packagePrice, { color: pkg.color }]}>
                  {pricing.symbol}{pkg.price.toLocaleString()}
                </Text>
                <Text style={s.packagePer}>/{t('settings_perMonth')}</Text>
              </View>
            </View>
            <View style={s.featureList}>
              {PLAN_FEATURES[pkg.name].map(f => (
                <Text key={f} style={s.feature}>✓  {f}</Text>
              ))}
            </View>
            <TouchableOpacity style={[s.pkgBtn, { backgroundColor: pkg.color }]}>
              <Text style={s.pkgBtnTxt}>{t('settings_select')}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Çıkış */}
      <View style={[s.section, { paddingBottom: 40 }]}>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
          {loggingOut
            ? <ActivityIndicator color="#EF4444" />
            : <Text style={s.logoutTxt}>{t('logout')}</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF8FF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF8FF' },
  hero: { backgroundColor: '#7C3AED', paddingTop: 60, paddingBottom: 28, paddingHorizontal: 20 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 12 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 16, padding: 16, gap: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#7C3AED20',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarTxt: { fontSize: 22, fontWeight: '800', color: '#7C3AED' },
  profileEmail: { fontSize: 15, fontWeight: '700', color: '#111827' },
  profileSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  packageCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  packageCardPopular: {
    borderWidth: 2, borderColor: '#7C3AED',
  },
  popularBadge: {
    alignSelf: 'flex-start', backgroundColor: '#7C3AED', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
  },
  popularTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  packageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  packageName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  packagePrice: { fontSize: 22, fontWeight: '800', textAlign: 'right' },
  packagePer: { fontSize: 11, color: '#9CA3AF', textAlign: 'right' },
  featureList: { gap: 6, marginBottom: 16 },
  feature: { fontSize: 13, color: '#374151' },
  pkgBtn: { padding: 12, borderRadius: 10, alignItems: 'center' },
  pkgBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  logoutBtn: {
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  logoutTxt: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
})
