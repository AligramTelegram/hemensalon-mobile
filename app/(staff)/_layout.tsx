import { useRef, useEffect, useState } from 'react'
import { Platform, View, Animated, StyleSheet, Text } from 'react-native'
import { Tabs, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback } from 'react'
import { PUSH_NOTIFS_KEY, type StoredPushNotif } from '../_layout'

const STAFF_READ_KEY = 'staff_push_read_ids'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function TabBarIcon({ focused, color, bg, icon, iconOutline }: {
  focused: boolean; color: string; bg: string; icon: IoniconsName; iconOutline: IoniconsName
}) {
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

const badge = StyleSheet.create({
  wrap: { position: 'absolute', top: -2, right: -4, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  txt: { color: '#fff', fontSize: 9, fontWeight: '800' },
})

export default function StaffLayout() {
  const { t } = useTranslation()
  const [unreadCount, setUnreadCount] = useState(0)

  const refreshBadge = useCallback(async () => {
    try {
      const [pushRaw, readRaw] = await Promise.all([
        AsyncStorage.getItem(PUSH_NOTIFS_KEY),
        AsyncStorage.getItem(STAFF_READ_KEY),
      ])
      const notifs: StoredPushNotif[] = pushRaw ? JSON.parse(pushRaw) : []
      const readIds: Set<string> = readRaw ? new Set(JSON.parse(readRaw)) : new Set()
      const now = Date.now()
      const count = notifs.filter(n => !n.read && !readIds.has(n.id) && now - n.receivedAt < 24 * 60 * 60 * 1000).length
      setUnreadCount(count)
    } catch {}
  }, [])

  useEffect(() => { refreshBadge() }, [refreshBadge])

  useFocusEffect(useCallback(() => { refreshBadge() }, [refreshBadge]))

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
      <Tabs.Screen
        name="index"
        options={{
          title: t('staff_portal_appointments'),
          tabBarActiveTintColor: '#7C3AED',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} color="#7C3AED" bg="#F5F3FF" icon="calendar" iconOutline="calendar-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="musteriler"
        options={{
          title: t('nav_customers'),
          tabBarActiveTintColor: '#2563EB',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} color="#2563EB" bg="#EFF6FF" icon="people" iconOutline="people-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="bildirimler"
        options={{
          title: t('notifications'),
          tabBarActiveTintColor: '#D97706',
          tabBarIcon: ({ focused }) => (
            <View>
              <TabBarIcon focused={focused} color="#D97706" bg="#FFFBEB" icon="notifications" iconOutline="notifications-outline" />
              {unreadCount > 0 && (
                <View style={badge.wrap}>
                  <Text style={badge.txt}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: t('staff_portal_profile'),
          tabBarActiveTintColor: '#059669',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} color="#059669" bg="#ECFDF5" icon="person" iconOutline="person-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="suspended"
        options={{ href: null }}
      />
    </Tabs>
  )
}
