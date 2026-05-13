import { useRef, useEffect } from 'react'
import { Platform, View, Animated, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

type TabConfig = { name: string; labelKey: string; icon: IoniconsName; iconOutline: IoniconsName; color: string; bg: string }

const TAB_DEFS: TabConfig[] = [
  { name: 'index',        labelKey: 'nav_home',         icon: 'home',     iconOutline: 'home-outline',     color: '#7C3AED', bg: '#F5F3FF' },
  { name: 'appointments', labelKey: 'nav_appointments', icon: 'calendar', iconOutline: 'calendar-outline', color: '#2563EB', bg: '#EFF6FF' },
  { name: 'customers',    labelKey: 'nav_customers',    icon: 'people',   iconOutline: 'people-outline',   color: '#059669', bg: '#ECFDF5' },
  { name: 'menu',         labelKey: 'nav_menu',         icon: 'grid',     iconOutline: 'grid-outline',     color: '#EA580C', bg: '#FFF7ED' },
]

function TabBarIcon({ focused, color, bg, icon, iconOutline }: { focused: boolean; color: string; bg: string; icon: IoniconsName; iconOutline: IoniconsName }) {
  const scale = useRef(new Animated.Value(1)).current
  const bgOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: focused ? 1.15 : 1, useNativeDriver: true, tension: 200, friction: 12 }),
      Animated.timing(bgOpacity, { toValue: focused ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [focused])

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 40, height: 32 }}>
      <Animated.View style={[ti.pill, { backgroundColor: bg, opacity: bgOpacity }]} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={focused ? icon : iconOutline} size={22} color={focused ? color : '#9CA3AF'} />
      </Animated.View>
    </View>
  )
}

const ti = StyleSheet.create({
  pill: { position: 'absolute', width: 40, height: 28, borderRadius: 14 },
})

export default function TabsLayout() {
  const { t } = useTranslation()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 28 : 16,
          left: 16,
          right: 16,
          height: 68,
          borderRadius: 24,
          backgroundColor: '#fff',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
          elevation: 16,
          borderTopWidth: 0,
          paddingBottom: Platform.OS === 'ios' ? 4 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      {TAB_DEFS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.labelKey),
            tabBarActiveTintColor: tab.color,
            tabBarIcon: ({ focused }) => (
              <TabBarIcon focused={focused} color={tab.color} bg={tab.bg} icon={tab.icon} iconOutline={tab.iconOutline} />
            ),
          }}
        />
      ))}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  )
}
