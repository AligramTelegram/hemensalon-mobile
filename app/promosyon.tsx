import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useHeaderPad } from '@/lib/useHeaderPad'
import { Ionicons } from '@expo/vector-icons'

export default function Promosyon() {
  const headerPad = useHeaderPad()
  const router = useRouter()

  return (
    <View style={s.root}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: headerPad }]}>
        <View style={s.decoCircle1} />
        <View style={s.decoCircle2} />
        <View style={s.heroTopRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={s.heroTitle}>Promosyonlar</Text>
        <Text style={s.heroSub}>İndirim kodu oluşturun ve yönetin</Text>
      </View>
      <View style={s.heroCurve} />

      {/* Fake list */}
      <View style={s.fakeContent} pointerEvents="none">
        {[1, 2, 3].map(i => (
          <View key={i} style={s.fakeCard}>
            <View style={s.fakeCode} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={[s.fakeLine, { width: '50%' }]} />
              <View style={[s.fakeLine, { width: '35%' }]} />
            </View>
            <View style={s.fakeSwitch} />
          </View>
        ))}
      </View>

      {/* Overlay */}
      <View style={s.overlay} pointerEvents="box-none">
        <View style={s.lockCard}>
          <View style={s.lockIconWrap}>
            <Ionicons name="pricetag-outline" size={36} color="#DC2626" />
          </View>
          <Text style={s.lockTitle}>Yakında Geliyor</Text>
          <Text style={s.lockSub}>
            Promosyon kodu sistemi çok yakında aktif olacak.{'\n'}
            Müşterilerinize özel indirim kodları oluşturabileceksiniz.
          </Text>
          <View style={s.featureList}>
            {['Yüzde veya sabit indirim', 'Kullanım limiti belirleme', 'Son kullanma tarihi ayarlama'].map(f => (
              <View key={f} style={s.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color="#DC2626" />
                <Text style={s.featureTxt}>{f}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.backBtn2} onPress={() => router.back()}>
            <Text style={s.backBtn2Txt}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },

  hero: { backgroundColor: '#DC2626', paddingBottom: 28, paddingHorizontal: 20, overflow: 'hidden' },
  decoCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#B91C1C', opacity: 0.5, top: -60, right: -40 },
  decoCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', opacity: 0.05, bottom: -20, left: 20 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  heroCurve: { height: 20, backgroundColor: '#DC2626', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },

  fakeContent: { padding: 16, gap: 10, marginTop: 10 },
  fakeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 16, opacity: 0.4 },
  fakeCode: { width: 80, height: 28, borderRadius: 8, backgroundColor: '#E5E7EB' },
  fakeLine: { height: 12, borderRadius: 6, backgroundColor: '#E5E7EB' },
  fakeSwitch: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#E5E7EB' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244,244,248,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  lockCard: {
    backgroundColor: '#fff',
    borderRadius: 28, padding: 28,
    alignItems: 'center',
    shadowColor: '#DC2626', shadowOpacity: 0.15, shadowRadius: 24, elevation: 8,
    borderWidth: 1, borderColor: '#FECACA',
    width: '100%',
  },
  lockIconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  lockTitle: { fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 10 },
  lockSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  featureList: { width: '100%', gap: 10, marginBottom: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureTxt: { fontSize: 14, fontWeight: '600', color: '#374151' },
  backBtn2: { backgroundColor: '#DC2626', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 16 },
  backBtn2Txt: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
