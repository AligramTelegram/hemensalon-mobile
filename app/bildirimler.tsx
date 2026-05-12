import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, RefreshControl, TextInput,
  Modal,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, Notification } from '@/lib/api'
import { useTranslation } from 'react-i18next'

type Tab = 'history' | 'templates'

type Template = {
  id: string
  nameKey: string
  triggerKey: string
  body: string
  channel: 'push' | 'email'
  isActive: boolean
}

const STATUS_COLOR: Record<string, string> = {
  BEKLIYOR: '#D97706', ONAYLANDI: '#2563EB',
  TAMAMLANDI: '#059669', IPTAL: '#DC2626', GELMEDI: '#6B7280',
}
const STATUS_BG: Record<string, string> = {
  BEKLIYOR: '#FFFBEB', ONAYLANDI: '#EFF6FF',
  TAMAMLANDI: '#ECFDF5', IPTAL: '#FEF2F2', GELMEDI: '#F9FAFB',
}

export default function Bildirimler() {
  const { t } = useTranslation()
  const headerPad = useHeaderPad()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('history')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [templates, setTemplates] = useState<Template[]>(() => [
    { id: '1', nameKey: 'notif_tmpl_1_name', triggerKey: 'notif_tmpl_1_trigger', body: t('notif_tmpl_1_body'), channel: 'push', isActive: true },
    { id: '2', nameKey: 'notif_tmpl_2_name', triggerKey: 'notif_tmpl_2_trigger', body: t('notif_tmpl_2_body'), channel: 'push', isActive: true },
    { id: '3', nameKey: 'notif_tmpl_3_name', triggerKey: 'notif_tmpl_3_trigger', body: t('notif_tmpl_3_body'), channel: 'email', isActive: true },
    { id: '4', nameKey: 'notif_tmpl_4_name', triggerKey: 'notif_tmpl_4_trigger', body: t('notif_tmpl_4_body'), channel: 'email', isActive: false },
    { id: '5', nameKey: 'notif_tmpl_5_name', triggerKey: 'notif_tmpl_5_trigger', body: t('notif_tmpl_5_body'), channel: 'email', isActive: false },
  ])
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [editBody, setEditBody] = useState('')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'history', label: t('notif_tab_history') },
    { key: 'templates', label: t('notif_tab_templates') },
  ]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setNotifications(await api.notifications.list())
    } catch (e) {
      console.warn('load notifications failed:', e)
      setNotifications([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit(tmpl: Template) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditingTemplate(tmpl)
    setEditBody(tmpl.body)
  }

  function saveTemplate() {
    if (!editingTemplate) return
    setTemplates(prev => prev.map(tmpl => tmpl.id === editingTemplate.id ? { ...tmpl, body: editBody } : tmpl))
    setEditingTemplate(null)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    Alert.alert(t('notif_template_saved_title'), t('notif_template_saved_msg'))
  }

  function toggleTemplate(id: string) {
    Haptics.selectionAsync()
    setTemplates(prev => prev.map(tmpl => tmpl.id === id ? { ...tmpl, isActive: !tmpl.isActive } : tmpl))
  }

  const newNotifs = notifications.filter(n => n.isNew)
  const oldNotifs = notifications.filter(n => !n.isNew)

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={{ width: 38 }} />
        </View>
        <Text style={s.headerTitle}>{t('notifications')}</Text>
        <Text style={s.headerSub}>{t('notif_push_sub')}</Text>

        <View style={s.tabBar}>
          {TABS.map(tb => (
            <TouchableOpacity key={tb.key} style={[s.tabBtn, tab === tb.key && s.tabBtnActive]} onPress={() => { Haptics.selectionAsync(); setTab(tb.key) }}>
              <Text style={[s.tabTxt, tab === tb.key && s.tabTxtActive]}>{tb.label}</Text>
              {tb.key === 'history' && newNotifs.length > 0 && (
                <View style={s.badge}><Text style={s.badgeTxt}>{newNotifs.length}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={s.headerCurve} />

      {tab === 'history' && (
        loading ? <View style={s.center}><ActivityIndicator color="#7C3AED" /></View> : (
          <ScrollView style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#7C3AED" />}>

            {newNotifs.length > 0 && (
              <>
                <Text style={s.sectionLabel}>{t('notifications_new')}</Text>
                {newNotifs.map(n => <NotifRow key={n.id} n={n} isNew />)}
              </>
            )}

            {oldNotifs.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: newNotifs.length > 0 ? 20 : 0 }]}>{t('notif_section_old')}</Text>
                {oldNotifs.map(n => <NotifRow key={n.id} n={n} isNew={false} />)}
              </>
            )}

            {notifications.length === 0 && (
              <View style={s.emptyWrap}>
                <Ionicons name="notifications-off-outline" size={56} color="#E5E7EB" />
                <Text style={s.emptyTxt}>{t('notifications_empty')}</Text>
              </View>
            )}
          </ScrollView>
        )
      )}

      {tab === 'templates' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={s.infoCard}>
            <Ionicons name="information-circle-outline" size={18} color="#2563EB" />
            <Text style={s.infoTxt}>{t('notif_template_hint')}</Text>
          </View>

          {templates.map(tmpl => (
            <View key={tmpl.id} style={[s.templateCard, !tmpl.isActive && s.templateCardInactive]}>
              <View style={s.templateTop}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={[s.channelBadge, { backgroundColor: tmpl.channel === 'push' ? '#EFF6FF' : '#F5F3FF' }]}>
                      <Ionicons name={tmpl.channel === 'push' ? 'phone-portrait-outline' : 'mail-outline'} size={11} color={tmpl.channel === 'push' ? '#2563EB' : '#7C3AED'} />
                      <Text style={[s.channelTxt, { color: tmpl.channel === 'push' ? '#2563EB' : '#7C3AED' }]}>{tmpl.channel === 'push' ? 'Push' : t('notif_channel_email')}</Text>
                    </View>
                    {tmpl.isActive ? (
                      <View style={s.activePill}><Text style={s.activePillTxt}>{t('active')}</Text></View>
                    ) : (
                      <View style={s.inactivePill}><Text style={s.inactivePillTxt}>{t('passive')}</Text></View>
                    )}
                  </View>
                  <Text style={s.templateName}>{t(tmpl.nameKey)}</Text>
                  <Text style={s.templateTrigger}>{t(tmpl.triggerKey)}</Text>
                </View>
                <TouchableOpacity style={s.toggleBtn} onPress={() => toggleTemplate(tmpl.id)}>
                  <Ionicons name={tmpl.isActive ? 'toggle' : 'toggle-outline'} size={28} color={tmpl.isActive ? '#059669' : '#9CA3AF'} />
                </TouchableOpacity>
              </View>

              <View style={s.templateBody}>
                <Text style={s.templateBodyTxt} numberOfLines={3}>{tmpl.body}</Text>
              </View>

              <TouchableOpacity style={s.editBtn} onPress={() => openEdit(tmpl)}>
                <Ionicons name="pencil-outline" size={14} color="#7C3AED" />
                <Text style={s.editBtnTxt}>{t('notif_template_edit_btn')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!editingTemplate} animationType="slide" presentationStyle="pageSheet">
        {editingTemplate && (
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>{t(editingTemplate.nameKey)}</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{t(editingTemplate.triggerKey)}</Text>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={() => setEditingTemplate(null)}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.modalLabel}>{t('notif_template_variables')}</Text>
              <View style={s.varRow}>
                {['{musteri_adi}', '{tarih}', '{saat}', '{hizmet}'].map(v => (
                  <TouchableOpacity key={v} style={s.varChip} onPress={() => setEditBody(b => b + v)}>
                    <Text style={s.varChipTxt}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.modalLabel, { marginTop: 16 }]}>{t('notif_template_msg_text')}</Text>
              <TextInput
                style={s.bodyInput}
                value={editBody}
                onChangeText={setEditBody}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                placeholder={t('notif_template_msg_placeholder')}
                placeholderTextColor="#9CA3AF"
              />

              <View style={s.previewCard}>
                <Text style={s.previewLabel}>{t('notif_template_preview')}</Text>
                <Text style={s.previewBody}>
                  {editBody
                    .replace('{musteri_adi}', t('notif_preview_name'))
                    .replace('{tarih}', t('notif_preview_date'))
                    .replace('{saat}', '14:30')
                    .replace('{hizmet}', t('notif_preview_service'))}
                </Text>
              </View>

              <TouchableOpacity style={s.saveBtn} onPress={saveTemplate}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={s.saveTxt}>{t('notif_template_save_btn')}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  )
}

function NotifRow({ n, isNew }: { n: Notification; isNew: boolean }) {
  const color = STATUS_COLOR[n.status] ?? '#6B7280'
  const bg = STATUS_BG[n.status] ?? '#F9FAFB'
  return (
    <View style={[nr.row, isNew && nr.rowNew]}>
      <View style={[nr.icon, { backgroundColor: bg }]}>
        <Ionicons name="cut-outline" size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={nr.customer}>{n.customerName}</Text>
          <Text style={nr.timeAgo}>{n.timeAgo}</Text>
        </View>
        <Text style={nr.service}>{n.serviceName}</Text>
        <View style={[nr.statusPill, { backgroundColor: bg }]}>
          <Text style={[nr.statusTxt, { color }]}>{n.statusLabel}</Text>
        </View>
      </View>
      {isNew && <View style={nr.dot} />}
    </View>
  )
}

const nr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  rowNew: { borderLeftWidth: 3, borderLeftColor: '#7C3AED' },
  icon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  customer: { fontSize: 14, fontWeight: '700', color: '#111827' },
  service: { fontSize: 12, color: '#6B7280', marginTop: 2, marginBottom: 6 },
  timeAgo: { fontSize: 11, color: '#9CA3AF' },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED', marginTop: 4, flexShrink: 0 },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#7C3AED', paddingBottom: 0, paddingHorizontal: 16, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#5B21B6', opacity: 0.35, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerCurve: { height: 20, backgroundColor: '#7C3AED', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16 },
  tabBar: { flexDirection: 'row', gap: 6, paddingBottom: 16 },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  tabBtnActive: { backgroundColor: '#fff' },
  tabTxt: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  tabTxtActive: { color: '#7C3AED' },
  badge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyWrap: { alignItems: 'center', paddingVertical: 64 },
  emptyTxt: { color: '#9CA3AF', marginTop: 12, fontSize: 14 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#BFDBFE' },
  infoTxt: { flex: 1, fontSize: 12, color: '#1D4ED8', lineHeight: 18, fontWeight: '500' },
  templateCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  templateCardInactive: { opacity: 0.65 },
  templateTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  channelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  channelTxt: { fontSize: 10, fontWeight: '700' },
  activePill: { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  activePillTxt: { fontSize: 10, fontWeight: '700', color: '#059669' },
  inactivePill: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  inactivePillTxt: { fontSize: 10, fontWeight: '700', color: '#9CA3AF' },
  templateName: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 6 },
  templateTrigger: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  toggleBtn: { padding: 4 },
  templateBody: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 12 },
  templateBodyTxt: { fontSize: 13, color: '#374151', lineHeight: 20 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F5F3FF' },
  editBtnTxt: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
  modal: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, padding: 20 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  varRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  varChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE' },
  varChipTxt: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
  bodyInput: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 14, color: '#111827', lineHeight: 22, minHeight: 140 },
  previewCard: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#DDD6FE' },
  previewLabel: { fontSize: 11, fontWeight: '700', color: '#7C3AED', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewBody: { fontSize: 14, color: '#374151', lineHeight: 22 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, marginTop: 20 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
