import { useRef, useEffect, useCallback } from 'react'
import { Platform, View, Animated, StyleSheet, Text, TouchableOpacity, Pressable } from 'react-native'
import { Tabs, useRouter, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { useTranslation } from 'react-i18next'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

type TabConfig = {
  name: string
  route: string
  labelKey: string
  icon: IoniconsName
  iconOutline: IoniconsName
  color: string
}

const TAB_DEFS: TabConfig[] = [
  { name: 'index',        route: '/(tabs)',              labelKey: 'nav_home',         icon: 'home',     iconOutline: 'home-outline',     color: '#7C3AED' },
  { name: 'appointments', route: '/(tabs)/appointments', labelKey: 'nav_appointments', icon: 'calendar', iconOutline: 'calendar-outline', color: '#2563EB' },
  { name: 'customers',    route: '/(tabs)/customers',    labelKey: 'nav_customers',    icon: 'people',   iconOutline: 'people-outline',   color: '#059669' },
  { name: 'menu',         route: '/(tabs)/menu',         labelKey: 'nav_menu',         icon: 'grid',     iconOutline: 'grid-outline',     color: '#EA580C' },
]

/* ── Tek dock butonu ─────────────────────────────────────────────────────── */
function DockItem({ tab, focused, onPress }: { tab: TabConfig; focused: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current
  const translateY = useRef(new Animated.Value(0)).current
  const dotOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,      { toValue: focused ? 1.18 : 1,  useNativeDriver: true, tension: 300, friction: 14 }),
      Animated.spring(translateY, { toValue: focused ? -4 : 0,    useNativeDriver: true, tension: 300, friction: 14 }),
      Animated.timing(dotOpacity, { toValue: focused ? 1 : 0,     duration: 200, useNativeDriver: true }),
    ]).start()
  }, [focused])

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, tension: 400, friction: 10 }).start()
  }, [])

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, { toValue: focused ? 1.18 : 1, useNativeDriver: true, tension: 300, friction: 14 }).start()
  }, [focused])

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={s.dockItem}
    >
      <Animated.View style={[s.dockItemInner, { transform: [{ scale }, { translateY }] }]}>
        {/* Icon wrap */}
        <View style={[s.iconWrap, focused && { backgroundColor: tab.color + '18' }]}>
          <Ionicons
            name={focused ? tab.icon : tab.iconOutline}
            size={23}
            color={focused ? tab.color : '#9CA3AF'}
          />
        </View>

        {/* Active dot */}
        <Animated.View style={[s.dot, { backgroundColor: tab.color, opacity: dotOpacity }]} />
      </Animated.View>
    </Pressable>
  )
}

/* ── Floating dock ───────────────────────────────────────────────────────── */
function FloatingDock() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()

  // Floating bob animasyonu
  const floatY = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -3, duration: 2000, useNativeDriver: true }),
        Animated.timing(floatY, { toValue:  3, duration: 2000, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: -3, duration: 2000, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  function isActive(tab: TabConfig) {
    if (tab.name === 'index') return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index'
    return pathname.includes(tab.name)
  }

  return (
    <Animated.View style={[s.dockWrapper, { transform: [{ translateY: floatY }] }]}>
      <BlurView intensity={60} tint="light" style={s.dockBlur}>
        <View style={s.dockInner}>
          {TAB_DEFS.map(tab => (
            <DockItem
              key={tab.name}
              tab={tab}
              focused={isActive(tab)}
              onPress={() => router.push(tab.route as never)}
            />
          ))}
        </View>
      </BlurView>
    </Animated.View>
  )
}

/* ── Layout ──────────────────────────────────────────────────────────────── */
export default function TabsLayout() {
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },  // Expo Router tab bar'ı gizle
        }}
      >
        {TAB_DEFS.map(tab => (
          <Tabs.Screen key={tab.name} name={tab.name} />
        ))}
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>

      <FloatingDock />
    </>
  )
}

/* ── Styles ──────────────────────────────────────────────────────────────── */
const BOTTOM = Platform.OS === 'ios' ? 36 : 20

const s = StyleSheet.create({
  dockWrapper: {
    position: 'absolute',
    bottom: BOTTOM,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  dockBlur: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 20,
  },
  dockInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dockItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dockItemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
})
