import { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, RefreshControl, ActivityIndicator, ScrollView, Platform } from 'react-native'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { api, Staff } from '@/lib/api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { secureStorage } from '@/lib/secureStorage'
import { useTranslation } from 'react-i18next'

const COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2', '#DB2777', '#EA580C']

export default function Calisanlar() {
  const { t } = useTranslation()
  const router = useRouter()
  const headerPad = useHeaderPad()
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState({ name: '', title: '', email: '', phone: '', color: '#7C3AED', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [loginInfo, setLoginInfo] = useState({ salonCode: '', phone: '', pin: '' })
  const [showPin, setShowPin] = useState(false)
  const [showLoginSection, setShowLoginSection] = useState(false)

  const load = useCallback(async () => {
    try { setStaff(await api.staff.list()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', title: '', email: '', phone: '', color: '#7C3AED', password: '' })
    setLoginInfo({ salonCode: '', phone: '', pin: '' })
    setShowPin(false)
    setShowPassword(false)
    setShowLoginSection(false)
    setShowModal(true)
  }

  async function openEdit(st: Staff) {
    setEditing(st)
    setForm({ name: st.name, title: st.title ?? '', email: st.email ?? '', phone: st.phone ?? '', color: st.color, password: '' })
    setShowPin(false)
    setShowLoginSection(false)
    // Kayıtlı giriş bilgilerini yükle
    try {
      const raw = await secureStorage.getItem(`staff_login_${st.id}`)
      if (raw) {
        const saved = JSON.parse(raw)
        setLoginInfo(saved)
        setShowLoginSection(true)
      } else {
        setLoginInfo({ salonCode: '', phone: '', pin: '' })
      }
    } catch {
      setLoginInfo({ salonCode: '', phone: '', pin: '' })
    }
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name) { Alert.alert(t('warning'), t('staff_nameRequired')); return }
    if (!editing && form.password.length < 6) { Alert.alert(t('warning'), 'Şifre en az 6 karakter olmalı'); return }
    if (showLoginSection) {
      if (!loginInfo.salonCode.trim()) { Alert.alert(t('warning'), t('staff_salonCodeRequired')); return }
      if (!loginInfo.phone.trim()) { Alert.alert(t('warning'), t('staff_phoneRequired')); return }
      if (loginInfo.pin.length < 4) { Alert.alert(t('warning'), t('staff_pinRequired')); return }
    }
    setSaving(true)
    try {
      const body = { name: form.name, title: form.title || undefined, email: form.email || undefined, phone: form.phone || undefined, color: form.color, ...(!editing && form.password ? { password: form.password } : {}) }
      let staffId = editing?.id
      if (editing) {
        const updated = await api.staff.update(editing.id, body)
        setStaff(prev => prev.map(s => s.id === editing.id ? { ...s, ...updated } : s))
      } else {
        const created = await api.staff.create(body)
        staffId = created?.id
        load()
      }
      // Giriş bilgilerini kaydet
      if (staffId) {
        const idxRaw = await AsyncStorage.getItem('staff_login_index')
        const idx: string[] = idxRaw ? JSON.parse(idxRaw) : []
        if (showLoginSection) {
          await secureStorage.setItem(`staff_login_${staffId}`, JSON.stringify({ ...loginInfo, name: form.name }))
          if (!idx.includes(staffId)) {
            await AsyncStorage.setItem('staff_login_index', JSON.stringify([...idx, staffId]))
          }
        } else {
          await secureStorage.removeItem(`staff_login_${staffId}`)
          await AsyncStorage.setItem('staff_login_index', JSON.stringify(idx.filter(i => i !== staffId)))
        }
      }
      setShowModal(false)
    } catch (e: unknown) { Alert.alert(t('error'), e instanceof Error ? e.message : t('err_failed')) }
    setSaving(false)
  }

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={openCreate}>
            <Ionicons name="add" size={16} color="#7C3AED" />
            <Text style={s.addTxt}>{t('new')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.headerTitle}>{t('staff_title')}</Text>
        <Text style={s.headerSub}>{t('staff_count', { count: staff.length })}</Text>
      </View>
      <View style={s.headerCurve} />

      {/* Arama */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#9CA3AF" />
        <TextInput
          style={s.searchInput}
          placeholder={t('staff_searchPlaceholder')}
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={17} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? <View style={s.center}><ActivityIndicator color="#7C3AED" /></View> : (
        <FlatList
          data={staff.filter(st => st.name.toLowerCase().includes(search.toLowerCase()))}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}
          ListEmptyComponent={<Text style={s.empty}>{t('staff_empty')}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/personel/${item.id}` as never)} onLongPress={() => openEdit(item)}>
              <View style={[s.avatar, { backgroundColor: item.color }]}>
                <Text style={s.avatarTxt}>{item.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}</Text>
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardName}>{item.name}</Text>
                {item.title && <Text style={s.cardTitle}>{item.title}</Text>}
                {item.services.length > 0 && (
                  <View style={s.serviceChips}>
                    {item.services.slice(0, 3).map(sv => (
                      <Text key={sv.id} style={s.svcChip}>{sv.name}</Text>
                    ))}
                    {item.services.length > 3 && <Text style={s.svcChip}>+{item.services.length - 3}</Text>}
                  </View>
                )}
              </View>
              <View style={[s.statusDot, { backgroundColor: item.isActive ? '#059669' : '#9CA3AF' }]} />
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? t('staff_edit') : t('staff_new')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <FField label={`${t('name')} *`} value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('staff_namePlaceholder')} />
            <FField label={t('title')} value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder={t('staff_titlePlaceholder')} />
            <FField label={t('email')} value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="ornek@mail.com" keyboardType="email-address" />
            {!editing && (
              <View style={{ marginBottom: 14 }}>
                <Text style={s.fieldLabel}>Şifre *</Text>
                <View style={s.pinRow}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    value={form.password}
                    onChangeText={v => setForm(f => ({ ...f, password: v }))}
                    placeholder="En az 6 karakter"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={s.pinEye} onPress={() => setShowPassword(v => !v)}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <FField label={t('phone')} value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="05XX XXX XX XX" keyboardType="phone-pad" />

            <Text style={s.fieldLabel}>{t('color')}</Text>
            <View style={s.colorGrid}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setForm(f => ({ ...f, color: c }))}
                  style={[s.colorDot, { backgroundColor: c }, form.color === c && s.colorDotActive]}>
                  {form.color === c && <Ionicons name="checkmark" size={18} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Giriş Bilgileri */}
            <TouchableOpacity style={s.loginToggle} onPress={() => setShowLoginSection(v => !v)}>
              <View style={s.loginToggleLeft}>
                <Ionicons name="key-outline" size={18} color="#7C3AED" />
                <Text style={s.loginToggleTxt}>{t('staff_loginInfo')}</Text>
              </View>
              <Ionicons name={showLoginSection ? 'chevron-up' : 'chevron-down'} size={18} color="#7C3AED" />
            </TouchableOpacity>

            {showLoginSection && (
              <View style={s.loginBox}>
                <View style={s.loginInfoBanner}>
                  <Ionicons name="information-circle-outline" size={15} color="#2563EB" />
                  <Text style={s.loginInfoTxt}>{t('staff_loginBanner')}</Text>
                </View>
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.fieldLabel}>{t('staff_salonCode')}</Text>
                  <TextInput
                    style={s.input}
                    value={loginInfo.salonCode}
                    onChangeText={v => setLoginInfo(f => ({ ...f, salonCode: v }))}
                    placeholder="SALON01"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="characters"
                  />
                </View>
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.fieldLabel}>{t('staff_staffPhone')}</Text>
                  <TextInput
                    style={s.input}
                    value={loginInfo.phone}
                    onChangeText={v => setLoginInfo(f => ({ ...f, phone: v }))}
                    placeholder="05XX XXX XX XX"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.fieldLabel}>{t('staff_pin')}</Text>
                  <View style={s.pinRow}>
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={loginInfo.pin}
                      onChangeText={v => setLoginInfo(f => ({ ...f, pin: v.replace(/\D/g, '').slice(0, 6) }))}
                      placeholder="••••"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      secureTextEntry={!showPin}
                      maxLength={6}
                    />
                    <TouchableOpacity style={s.pinEye} onPress={() => setShowPin(v => !v)}>
                      <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={s.loginSummary}>
                  <Ionicons name="person-circle-outline" size={16} color="#059669" />
                  <Text style={s.loginSummaryTxt}>
                    {t('staff_loginSummary')}: {loginInfo.salonCode || '?'} / {loginInfo.phone || '?'} / {loginInfo.pin ? '●'.repeat(loginInfo.pin.length) : '?'}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>{editing ? t('update') : t('staff_add')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function FField({ label, value, onChange, placeholder, keyboardType }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboardType?: any }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9CA3AF" keyboardType={keyboardType ?? 'default'} autoCapitalize="none" />
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#7C3AED', paddingBottom: 28, paddingHorizontal: 16, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  addTxt: { color: '#7C3AED', fontWeight: '700', fontSize: 13 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', margin: 12, marginBottom: 4, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E5E7EB', height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 48, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1, gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: '800', color: '#fff' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardTitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  serviceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  svcChip: { fontSize: 11, color: '#7C3AED', backgroundColor: '#F5F3FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, fontWeight: '600' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, padding: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB' },
  colorGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  colorDot: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  colorDotActive: { transform: [{ scale: 1.15 }] },
  saveBtn: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: '#DDD6FE' },
  loginToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loginToggleTxt: { fontSize: 14, fontWeight: '700', color: '#7C3AED' },
  loginBox: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: '#E5E7EB' },
  loginInfoBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 10, marginBottom: 14 },
  loginInfoTxt: { fontSize: 12, color: '#2563EB', flex: 1 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinEye: { width: 48, height: 48, backgroundColor: '#F3F4F6', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  loginSummary: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0FDF4', borderRadius: 8, padding: 10 },
  loginSummaryTxt: { fontSize: 12, color: '#059669', fontWeight: '600' },
})
