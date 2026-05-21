import { useRef, useEffect, useCallback } from 'react'
import { Platform, View, Animated, StyleSheet, Pressable } from 'react-native'
import { useRouter, usePathname, useSegments } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'

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

const DOCK_VISIBLE_SCREENS = [
  'calisanlar', 'hizmetler', 'finans',
  'ayarlar', 'raporlar', 'stok', 'paketler',
  'abonelik', 'kampanya', 'promosyon', 'bildirimler',
  'arama', 'musteri', 'randevu', 'personel',
]

function DockItem({ tab, focused, onPress }: { tab: TabConfig; focused: boolean; onPress: () => void }) {
  const scale      = useRef(new Animated.Value(1)).current
  const translateY = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,      { toValue: focused ? 1.18 : 1, useNativeDriver: true, tension: 300, friction: 14 }),
      Animated.spring(translateY, { toValue: focused ? -4 : 0,   useNativeDriver: true, tension: 300, friction: 14 }),
    ]).start()
  }, [focused])

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.82, useNativeDriver: true, tension: 400, friction: 10 }).start()
  }, [])

  const handlePressOut = useCallback(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: focused ? 1.28 : 1.12, useNativeDriver: true, tension: 400, friction: 6 }),
      Animated.spring(scale, { toValue: focused ? 1.18 : 1,    useNativeDriver: true, tension: 300, friction: 14 }),
    ]).start()
  }, [focused])

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={s.item}>
      <Animated.View style={[s.itemInner, { transform: [{ scale }, { translateY }] }]}>
        <View style={[s.iconWrap, focused && { backgroundColor: tab.color + '20' }]}>
          <Ionicons
            name={focused ? tab.icon : tab.iconOutline}
            size={24}
            color={focused ? tab.color : '#9CA3AF'}
          />
        </View>
        {focused && <View style={[s.dot, { backgroundColor: tab.color }]} />}
      </Animated.View>
    </Pressable>
  )
}

export function FloatingDock() {
  const router   = useRouter()
  const pathname = usePathname()
  const segments = useSegments()
  const insets   = useSafeAreaInsets()

  const seg0    = segments[0] ?? ''
  const hidden  = seg0 === '(auth)' || seg0 === '(staff)' || seg0 === 'deneme-bitti' || seg0 === ''
  const visible = !hidden && (seg0 === '(tabs)' || DOCK_VISIBLE_SCREENS.includes(seg0))

  if (!visible) return null

  function isActive(tab: TabConfig) {
    if (tab.name === 'index') return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index'
    return pathname.includes(tab.name)
  }

  const bottomOffset = (insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 16 : 0)) + 12

  return (
    <View style={[s.wrapper, { bottom: bottomOffset }]} pointerEvents="box-none">
      <BlurView intensity={80} tint="light" style={s.blur}>
        <View style={s.inner}>
          {TAB_DEFS.map(tab => (
            <DockItem
              key={tab.name}
              tab={tab}
              focused={isActive(tab)}
              onPress={() => { Haptics.selectionAsync(); router.navigate(tab.route as never) }}
            />
          ))}
        </View>
      </BlurView>
    </View>
  )
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 100,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  blur: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)',
    borderRadius: 28,
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
    width: 48,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
})
