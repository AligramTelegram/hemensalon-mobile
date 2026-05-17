import { useRef, useEffect, useCallback } from 'react'
import { Platform, View, Animated, StyleSheet, Pressable, Dimensions } from 'react-native'
import { useRouter, usePathname, useSegments } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

type TabConfig = {
  name: string
  route: string
  icon: IoniconsName
  iconOutline: IoniconsName
  color: string
}

const TAB_DEFS: TabConfig[] = [
  { name: 'index',        route: '/(tabs)',              icon: 'home',          iconOutline: 'home-outline',         color: '#7C3AED' },
  { name: 'appointments', route: '/(tabs)/appointments', icon: 'calendar',      iconOutline: 'calendar-outline',     color: '#2563EB' },
  { name: 'customers',    route: '/(tabs)/customers',    icon: 'people',        iconOutline: 'people-outline',       color: '#059669' },
  { name: 'calisanlar',   route: '/calisanlar',          icon: 'person-circle', iconOutline: 'person-circle-outline',color: '#0891B2' },
  { name: 'hizmetler',    route: '/hizmetler',           icon: 'cut',           iconOutline: 'cut-outline',          color: '#D97706' },
  { name: 'menu',         route: '/(tabs)/menu',         icon: 'grid',          iconOutline: 'grid-outline',         color: '#EA580C' },
]

// (tabs) dışındaki dock'un göründüğü root stack ekranlar
const DOCK_VISIBLE_SCREENS = [
  'calisanlar', 'hizmetler', 'finans',
  'ayarlar', 'raporlar', 'stok', 'paketler',
  'abonelik', 'kampanya', 'promosyon', 'bildirimler',
  'arama', 'musteri', 'randevu', 'personel',
]

function DockItem({ tab, focused, onPress }: { tab: TabConfig; focused: boolean; onPress: () => void }) {
  const scale      = useRef(new Animated.Value(1)).current
  const translateY = useRef(new Animated.Value(0)).current
  const dotOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,      { toValue: focused ? 1.15 : 1, useNativeDriver: true, tension: 300, friction: 14 }),
      Animated.spring(translateY, { toValue: focused ? -3 : 0,   useNativeDriver: true, tension: 300, friction: 14 }),
      Animated.timing(dotOpacity, { toValue: focused ? 1 : 0,    duration: 200, useNativeDriver: true }),
    ]).start()
  }, [focused])

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, tension: 400, friction: 10 }).start()
  }, [])

  const handlePressOut = useCallback(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: focused ? 1.22 : 1.08, useNativeDriver: true, tension: 400, friction: 6 }),
      Animated.spring(scale, { toValue: focused ? 1.15 : 1,    useNativeDriver: true, tension: 300, friction: 14 }),
    ]).start()
  }, [focused])

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={s.item}>
      <Animated.View style={[s.itemInner, { transform: [{ scale }, { translateY }] }]}>
        <View style={[s.iconWrap, focused && { backgroundColor: tab.color + '18' }]}>
          <Ionicons
            name={focused ? tab.icon : tab.iconOutline}
            size={26}
            color={focused ? tab.color : '#B0B0BE'}
          />
        </View>
        <Animated.View style={[s.dot, { backgroundColor: tab.color, opacity: dotOpacity }]} />
      </Animated.View>
    </Pressable>
  )
}

export function FloatingDock() {
  const router = useRouter()
  const pathname = usePathname()
  const segments = useSegments()

  const seg0 = segments[0] ?? ''
  const hidden = seg0 === '(auth)' || seg0 === '(staff)' || seg0 === 'deneme-bitti' || seg0 === ''
  const visible = !hidden && (
    seg0 === '(tabs)' ||
    DOCK_VISIBLE_SCREENS.includes(seg0)
  )

  if (!visible) return null

  function isActive(tab: TabConfig) {
    if (tab.name === 'index') return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index'
    return pathname.includes(tab.name)
  }

  return (
    <View style={s.wrapper}>
      <BlurView intensity={70} tint="light" style={s.blur}>
        <View style={s.inner}>
          {TAB_DEFS.map(tab => (
            <DockItem
              key={tab.name}
              tab={tab}
              focused={isActive(tab)}
              onPress={() => router.navigate(tab.route as never)}
            />
          ))}
        </View>
      </BlurView>
    </View>
  )
}

const BOTTOM_PAD = Platform.OS === 'ios' ? 28 : 0

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  blur: {
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: BOTTOM_PAD + 10,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInner: {
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 52,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
})
