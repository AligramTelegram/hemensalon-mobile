import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ScrollView, ActivityIndicator, Modal, TextInput } from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { secureStorage } from '@/lib/secureStorage'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { staffApi } from '@/lib/api'

type StaffData = { name: string; staffId?: string; role?: string }

export default function StaffProfil() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const queryClient = useQueryClient()
  const [staffData, setStaffData] = useState<StaffData | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [showPassModal, setShowPassModal] = useState(false)
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newPassConfirm, setNewPassConfirm] = useState('')
  const [changingPass, setChangingPass] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    secureStorage.getItem('staff_data').then(raw => {
      if (raw) setStaffData(JSON.parse(raw))
    })
  }, [])

  async function handleChangePassword() {
    if (!currentPass || !newPass || !newPassConfirm) {
      Alert.alert(t('warning'), 'Tüm alanları doldurun'); return
    }
    if (newPass !== newPassConfirm) {
      Alert.alert(t('warning'), 'Yeni şifreler eşleşmiyor'); return
    }
    if (newPass.length < 6) {
      Alert.alert(t('warning'), 'Şifre en az 6 karakter olmalı'); return
    }
    setChangingPass(true)
    try {
      await staffApi.changePassword(currentPass, newPass)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert('Başarılı', 'Şifreniz güncellendi')
      setShowPassModal(false)
      setCurrentPass(''); setNewPass(''); setNewPassConfirm('')
    } catch (e: unknown) {
      Alert.alert(t('error'), e instanceof Error ? e.message : 'Şifre güncellenemedi')
    }
    setChangingPass(false)
  }

  function handleLogout() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert(t('logout'), t('staff_portal_logout_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'), style: 'destructive', onPress: async () => {
          setLoggingOut(true)
          queryClient.clear()
          await secureStorage.removeItem('staff_token')
          await secureStorage.removeItem('staff_data')
          await secureStorage.removeItem('mobile_token')
          await secureStorage.removeItem('refresh_token')
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const initials = (staffData?.name ?? 'P').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{initials}</Text>
          </View>
          <View style={s.staffBadge}>
            <Ionicons name="cut-outline" size={11} color="#7C3AED" />
            <Text style={s.staffBadgeTxt}>{t('staff_portal_badge')}</Text>
          </View>
        </View>
        <Text style={s.heroName}>{staffData?.name ?? t('staff_portal_badge')}</Text>
        <Text style={s.heroSub}>{t('staff_portal_sub')}</Text>
      </View>
      <View style={s.heroCurve} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        {/* Bilgi kartı */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('staff_portal_account')}</Text>
          <InfoRow icon="person-outline" label={t('name')} value={staffData?.name ?? '—'} />
          <InfoRow icon="shield-checkmark-outline" label={t('staff_portal_role_label')} value={t('staff_portal_badge')} />
          <InfoRow icon="key-outline" label={t('staff_portal_login_type_label')} value={t('staff_portal_login_type_value')} />
        </View>

        {/* Kısayollar */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('today')}</Text>
          <TouchableOpacity style={s.shortcut} onPress={() => router.push('/(staff)/')}>
            <View style={[s.shortcutIcon, { backgroundColor: '#F5F3FF' }]}>
              <Ionicons name="calendar-outline" size={20} color="#7C3AED" />
            </View>
            <Text style={s.shortcutTxt}>{t('staff_portal_view_apts')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={s.shortcut} onPress={() => { Haptics.selectionAsync(); setShowPassModal(true) }}>
            <View style={[s.shortcutIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="lock-closed-outline" size={20} color="#D97706" />
            </View>
            <Text style={s.shortcutTxt}>Şifre Değiştir</Text>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Bilgi notu */}
        <View style={s.noteBox}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
          <Text style={s.noteTxt}>{t('staff_portal_info_note')}</Text>
        </View>

        {/* Çıkış */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
          {loggingOut
            ? <ActivityIndicator color="#EF4444" />
            : <>
                <View style={s.logoutIcon}>
                  <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                </View>
                <Text style={s.logoutTxt}>{t('logout')}</Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>

      {/* Şifre değiştir modal */}
      <Modal visible={showPassModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPassModal(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Şifre Değiştir</Text>
            <TouchableOpacity onPress={() => setShowPassModal(false)} style={s.modalClose}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.inputLabel}>Mevcut Şifre</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={currentPass}
                onChangeText={setCurrentPass}
                placeholder="••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showCurrent}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowCurrent(v => !v)} style={s.eyeBtn}>
                <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text style={s.inputLabel}>Yeni Şifre</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={newPass}
                onChangeText={setNewPass}
                placeholder="En az 6 karakter"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showNew}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowNew(v => !v)} style={s.eyeBtn}>
                <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text style={s.inputLabel}>Yeni Şifre (Tekrar)</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={newPassConfirm}
                onChangeText={setNewPassConfirm}
                placeholder="••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showNew}
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity style={s.saveBtn} onPress={handleChangePassword} disabled={changingPass}>
              {changingPass
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveTxt}>Şifreyi Güncelle</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={ir.wrap}>
      <View style={ir.iconBox}>
        <Ionicons name={icon as any} size={16} color="#7C3AED" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ir.label}>{label}</Text>
        <Text style={ir.value}>{value}</Text>
      </View>
    </View>
  )
}
const ir = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  iconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 11, color: '#9CA3AF' },
  value: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 1 },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },

  hero: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 20,
    paddingBottom: 28,
    alignItems: 'center',
    overflow: 'hidden',
  },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  heroCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },

  avatarWrap: { alignItems: 'center', marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)' },
  avatarTxt: { fontSize: 32, fontWeight: '900', color: '#fff' },
  staffBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10 },
  staffBadgeTxt: { fontSize: 11, fontWeight: '800', color: '#7C3AED' },

  heroName: { fontSize: 22, fontWeight: '900', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  shortcutIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  shortcutTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },

  noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16 },
  noteTxt: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 18 },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#FECACA' },
  logoutIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  logoutTxt: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

  modal: { flex: 1, backgroundColor: '#F4F4F8' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  modalBody: { padding: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, height: 48, paddingHorizontal: 14, fontSize: 15, color: '#111827' },
  eyeBtn: { paddingHorizontal: 12 },
  saveBtn: { backgroundColor: '#7C3AED', borderRadius: 14, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  saveTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
