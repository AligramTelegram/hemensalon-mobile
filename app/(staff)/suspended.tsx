import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useRouter, useNavigation } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { secureStorage } from '@/lib/secureStorage'
import { staffApi } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function StaffSuspended() {
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const polling = useRef<ReturnType<typeof setInterval> | null>(null)

  // Tab bar'ı gizle
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: 'none' } })
  }, [navigation])

  // Her 30 saniyede abonelik durumunu kontrol et — aktif olunca otomatik geç
  useEffect(() => {
    polling.current = setInterval(async () => {
      try {
        const { active } = await staffApi.tenantStatus()
        if (active) {
          clearInterval(polling.current!)
          await AsyncStorage.removeItem('staff_suspended')
          queryClient.clear()
          router.replace('/(staff)')
        }
      } catch {}
    }, 30_000)

    return () => { if (polling.current) clearInterval(polling.current) }
  }, [])

  async function handleLogout() {
    if (polling.current) clearInterval(polling.current)
    queryClient.clear()
    await AsyncStorage.removeItem('staff_suspended')
    await secureStorage.removeItem('staff_token')
    await secureStorage.removeItem('staff_data')
    await secureStorage.removeItem('mobile_token')
    await secureStorage.removeItem('refresh_token')
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  return (
    <View style={s.root}>
      <View style={s.card}>
        <View style={s.iconWrap}>
          <Ionicons name="lock-closed" size={48} color="#DC2626" />
        </View>
        <Text style={s.title}>Erişim Kısıtlandı</Text>
        <Text style={s.message}>
          İşletmenizin aboneliği sona erdi.{'\n'}Lütfen işletme sahibiyle iletişime geçin.
        </Text>
        <View style={s.pollingRow}>
          <ActivityIndicator size="small" color="#9CA3AF" />
          <Text style={s.pollingTxt}>Abonelik yenilenince otomatik açılacak</Text>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={s.logoutTxt}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: '#fff', borderRadius: 24, padding: 32,
    alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  iconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  pollingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28 },
  pollingTxt: { fontSize: 12, color: '#9CA3AF' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#FCA5A5', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  logoutTxt: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
})
