import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { Plan } from '@/lib/usePlanFeatures'
import { PLAN_LABELS, PLAN_COLORS } from '@/lib/usePlanFeatures'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

interface Props {
  requiredPlan: Plan
  title: string
  description: string
  features: string[]
  icon?: IoniconsName
}

export default function UpgradeOverlay({ requiredPlan, title, description, features, icon = 'lock-closed-outline' }: Props) {
  const router = useRouter()
  const { t } = useTranslation()
  const planColor = PLAN_COLORS[requiredPlan]
  const planLabel = PLAN_LABELS[requiredPlan]

  return (
    <View style={s.overlay} pointerEvents="box-none">
      <View style={[s.card, { borderColor: planColor + '40' }]}>
        <View style={[s.iconWrap, { backgroundColor: planColor + '15' }]}>
          <Ionicons name={icon} size={36} color={planColor} />
        </View>

        <View style={[s.planBadge, { backgroundColor: planColor + '15' }]}>
          <Ionicons name="flash" size={12} color={planColor} />
          <Text style={[s.planBadgeTxt, { color: planColor }]}>{t('upgrade_badge', { plan: planLabel })}</Text>
        </View>

        <Text style={s.title}>{title}</Text>
        <Text style={s.desc}>{description}</Text>

        <View style={s.features}>
          {features.map(f => (
            <View key={f} style={s.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color={planColor} />
              <Text style={s.featureTxt}>{f}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[s.btn, { backgroundColor: planColor }]}
          onPress={() => router.push('/abonelik' as never)}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />
          <Text style={s.btnTxt}>{t('upgrade_cta', { plan: planLabel })}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnTxt}>{t('upgrade_back')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244,244,248,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1.5,
    width: '100%',
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 14,
  },
  planBadgeTxt: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  desc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  features: {
    width: '100%',
    gap: 10,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  backBtn: {
    paddingVertical: 10,
  },
  backBtnTxt: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
})
