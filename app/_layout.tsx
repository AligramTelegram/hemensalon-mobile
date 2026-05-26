import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { FloatingDock } from '@/components/FloatingDock';
import { SplashAnimation } from '@/components/SplashAnimation';
import { detectCountry } from '@/lib/pricing';
import { initI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { View, ActivityIndicator, I18nManager, Platform, Alert } from 'react-native';
import { isRTL } from '@/lib/i18n';
import * as Notifications from 'expo-notifications';
import { api, staffApi, getCachedTenant, setCachedTenant } from '@/lib/api';
import { initPurchases } from '@/lib/purchases';
import type { Session } from '@supabase/supabase-js';
import { ThemeProvider } from '@/lib/theme'
import { EXPO_PROJECT_ID } from '@/lib/constants'
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage'
import { secureStorage } from '@/lib/secureStorage';
import { scheduleTips } from '@/lib/scheduleTips';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const persister = createAsyncStoragePersister({ storage: AsyncStorage })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,           // 30 saniye: taze sayılır
      gcTime: 24 * 60 * 60 * 1000,    // 24 saat: persist cache için uzun tutulur
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,        // internet gelince yenile
    },
  },
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

if (typeof navigator !== 'undefined') {
  // Android bildirim kanalı — ses için zorunlu
  Notifications.setNotificationChannelAsync('default', {
    name: 'Bildirimler',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
  }).catch(() => {})
}

export const PUSH_NOTIFS_KEY = 'push_notifications_log'

export interface StoredPushNotif {
  id: string
  title: string
  body: string
  data?: Record<string, unknown>
  receivedAt: number
  read: boolean
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [staffToken, setStaffToken] = useState<string | null>(null);
  const [staffSuspended, setStaffSuspended] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // İlk kurulumda bildirim izni iste
  useEffect(() => {
    AsyncStorage.getItem('notif_permission_asked').then(asked => {
      if (!asked) {
        Notifications.requestPermissionsAsync().then(() => {
          AsyncStorage.setItem('notif_permission_asked', '1')
        }).catch(() => {})
      }
    })
  }, [])

  useEffect(() => {
    async function setup() {
      const setupStart = __DEV__ ? Date.now() : 0
      try {
      const country = await detectCountry();
      await initI18n(country);
      // RTL sadece değiştiğinde uygula — her açılışta forceRTL çağırmak iOS'ta crash'e yol açar
      const shouldBeRTL = isRTL()
      if (I18nManager.isRTL !== shouldBeRTL) {
        I18nManager.forceRTL(shouldBeRTL)
      }

      // Oturum süresi kontrolü — JWT expiry'sine göre, yoksa 24h fallback
      const expiresAtStr = await secureStorage.getItem('session_expires_at')
      const loginTimeStr = await secureStorage.getItem('login_time')
      const isExpired = expiresAtStr
        ? Date.now() > parseInt(expiresAtStr, 10)
        : loginTimeStr
          ? Date.now() - parseInt(loginTimeStr, 10) > 12 * 60 * 60 * 1000
          : false
      if (isExpired) {
        await supabase.auth.signOut()
        await secureStorage.removeItem('mobile_token')
        await secureStorage.removeItem('refresh_token')
        await secureStorage.removeItem('staff_token')
        await secureStorage.removeItem('staff_data')
        await secureStorage.removeItem('login_time')
        await secureStorage.removeItem('session_expires_at')
        Alert.alert('', 'Oturumunuzun süresi doldu, lütfen tekrar giriş yapın.')
      }

      // Supabase session kontrolü
      const { data: { session: s }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || (s && !s.refresh_token)) {
        await supabase.auth.signOut()
        await secureStorage.removeItem('mobile_token')
        await secureStorage.removeItem('refresh_token')
        await secureStorage.removeItem('login_time')
        await secureStorage.removeItem('session_expires_at')
        setSession(null)
      } else {
        setSession(s);
      }

      // Staff token kontrolü
      const [st, cachedTid] = await Promise.all([
        secureStorage.getItem('staff_token'),
        AsyncStorage.getItem('cached_tenant_id'),
      ]);
      setStaffToken(st);

      // Staff varsa abonelik durumunu setup'ta kontrol et — ekran görünmeden kilitle
      if (st) {
        try {
          const result = await staffApi.tenantStatus()
          if (!result.active) {
            setStaffSuspended(true)
            await AsyncStorage.setItem('staff_suspended', '1')
          } else {
            await AsyncStorage.removeItem('staff_suspended')
          }
        } catch {}
      }

      // Dönüş kullanıcısı: routing bitmeden arka planda prefetch başlat
      if (s && !st && cachedTid && !isExpired) {
        const d = new Date()
        const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        if (__DEV__) console.log(`[perf] setup done in ${Date.now() - setupStart}ms — starting prefetch`)
        const prefetchStart = __DEV__ ? Date.now() : 0
        Promise.all([
          queryClient.prefetchQuery({
            queryKey: ['dashboard', cachedTid],
            queryFn: () => api.dashboard.full(todayStr),
            staleTime: 20 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['appointments', cachedTid, todayStr],
            queryFn: () => api.appointments.list({ date: todayStr }),
            staleTime: 20 * 1000,
          }),
        ]).then(() => {
          if (__DEV__) console.log(`[perf] prefetch complete: ${Date.now() - prefetchStart}ms`)
        }).catch(() => {})
      } else if (__DEV__) {
        console.log(`[perf] setup done in ${Date.now() - setupStart}ms (no prefetch)`)
      }

      if (s) {
        try {
          await initPurchases(s.user.id)
        } catch (e) {
          console.warn('[RevenueCat] initPurchases failed:', e)
        }
        try {
          const asked = await AsyncStorage.getItem('notif_permission_asked')
          if (!asked) {
            await Notifications.requestPermissionsAsync()
            await AsyncStorage.setItem('notif_permission_asked', '1')
          }
          const { status } = await Notifications.getPermissionsAsync()
          if (status === 'granted') {
            const tokenData = await Notifications.getExpoPushTokenAsync({
              projectId: EXPO_PROJECT_ID,
            });
            await api.pushToken.register(tokenData.data);
            await scheduleTips();
          }
        } catch (e) {
          console.warn('[Notifications] setup failed:', e)
        }
      }

      // Staff oturumu için push token kaydet
      const freshStaffToken = await secureStorage.getItem('staff_token')
      if (freshStaffToken) {
        try {
          const { status } = await Notifications.getPermissionsAsync()
          if (status === 'granted') {
            const tokenData = await Notifications.getExpoPushTokenAsync({
              projectId: EXPO_PROJECT_ID,
            })
            await api.pushToken.registerStaff(tokenData.data)
          }
        } catch (e) {
          console.warn('[Notifications] staff push token failed:', e)
        }
      }

      setReady(true);
      } catch (e) {
        console.error('[setup] FATAL:', e)
        // Crash yerine yine de devam et
        setReady(true);
      }
    }
    setup();

    // Gelen push bildirimlerini AsyncStorage'a kaydet ve cache'i yenile
    const notifSub = Notifications.addNotificationReceivedListener(async (notif) => {
      try {
        const { impactAsync, ImpactFeedbackStyle } = await import('expo-haptics')
        impactAsync(ImpactFeedbackStyle.Medium).catch(() => {})
      } catch {}
      try {
        const raw = await AsyncStorage.getItem(PUSH_NOTIFS_KEY)
        const list: StoredPushNotif[] = raw ? JSON.parse(raw) : []
        const newEntry: StoredPushNotif = {
          id: notif.request.identifier,
          title: notif.request.content.title ?? '',
          body: notif.request.content.body ?? '',
          data: (notif.request.content.data ?? {}) as Record<string, unknown>,
          receivedAt: Date.now(),
          read: false,
        }
        const updated = [newEntry, ...list].slice(0, 50)
        await AsyncStorage.setItem(PUSH_NOTIFS_KEY, JSON.stringify(updated))
        // Randevu ve dashboard cache'ini anında geçersiz kıl
        queryClient.invalidateQueries({ queryKey: ['appointments'], exact: false })
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false })
      } catch {}
    })

    const sub = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED' && !s) {
        // Refresh token geçersiz — oturumu temizle
        supabase.auth.signOut()
        secureStorage.removeItem('mobile_token')
        secureStorage.removeItem('refresh_token')
        secureStorage.removeItem('login_time')
        secureStorage.removeItem('session_expires_at')
        setSession(null)
        return
      }
      setSession(s);
      if (event === 'SIGNED_OUT') {
        secureStorage.removeItem('staff_token');
        secureStorage.removeItem('staff_data');
        secureStorage.removeItem('mobile_token');
        secureStorage.removeItem('refresh_token');
        secureStorage.removeItem('login_time');
        AsyncStorage.removeItem('cached_tenant_id').catch(() => {});
        setStaffToken(null);
        // Tüm query cache'ini temizle — eski kullanıcı verisi gözükmesin
        queryClient.clear();
      }
    });

    return () => {
      notifSub.remove()
      const anySub = sub as any
      const subscription = anySub?.subscription
      if (subscription?.unsubscribe) subscription.unsubscribe()
      else if (sub?.data?.subscription?.unsubscribe) sub.data.subscription.unsubscribe()
    };
  }, []);

  const isLoggedIn = !!session || !!staffToken;

  useEffect(() => {
    if (!ready) return;
    async function route() {
      const inAuth = segments[0] === '(auth)';
      const inStaff = segments[0] === '(staff)';
      const inTabs = segments[0] === '(tabs)';

      const freshStaffToken = await secureStorage.getItem('staff_token');
      const freshMobileToken = await secureStorage.getItem('mobile_token');
      // Staff: staff_token marker var VE mobile_token (gerçek JWT) var
      const isStaffSession = !!freshStaffToken && !!freshMobileToken;
      const loggedIn = !!session || isStaffSession;
      const inPaywall = segments[0] === 'deneme-bitti';

      if (!loggedIn && !inAuth) {
        // İlk kullanıcıya onboarding göster
        const onboardingDone = await AsyncStorage.getItem('onboarding_done');
        if (!onboardingDone) {
          router.replace('/(auth)/onboarding');
        } else {
          router.replace('/(auth)/login');
        }
        return;
      } else if (loggedIn && inAuth) {
        router.replace(isStaffSession ? '/(staff)' : '/(tabs)');
        return;
      } else if (isStaffSession && inTabs) {
        router.replace('/(staff)');
        return;
      } else if (!isStaffSession && inStaff && session) {
        router.replace('/(tabs)');
        return;
      }

      // Staff abonelik kontrolü
      if (isStaffSession && inStaff) {
        // setup'ta set edilen veya önceki oturumdan kalan bayrak
        const suspFlag = await AsyncStorage.getItem('staff_suspended')
        if (staffSuspended || suspFlag === '1') {
          router.replace('/(staff)/suspended')
          return
        }
        // Sadece index'te (tab değişiminde değil) canlı kontrol yap
        if (!segments[1]) {
          try {
            const { active } = await staffApi.tenantStatus()
            if (!active) {
              setStaffSuspended(true)
              await AsyncStorage.setItem('staff_suspended', '1')
              router.replace('/(staff)/suspended')
              return
            }
          } catch {}
        }
      }

      // Erişim kilidi kontrolü — sadece owner oturumu için
      if (session && !isStaffSession) {
        try {
          // Cache'den oku — her segment değişiminde HTTP isteği yapma
          let profile = getCachedTenant()
          if (!profile) {
            profile = await api.tenant.get()
            setCachedTenant(profile)
          }
          const now = Date.now();

          // Geçerli erişim: aktif trial VEYA aktif ücretli plan
          const trialActive = !!profile.trialEndsAt &&
            new Date(profile.trialEndsAt).getTime() > now;
          const paidActive = !!profile.planEndsAt &&
            new Date(profile.planEndsAt).getTime() > now;

          const hasAccess = trialActive || paidActive;

          if (!hasAccess && !inPaywall) {
            router.replace('/deneme-bitti');
            return;
          }
          if (hasAccess && inPaywall) {
            router.replace('/(tabs)');
            return;
          }
        } catch (e) {
          console.warn('Route guard access check failed:', e)
          if (e instanceof Error) {
            // Staff hesabı owner girişi denedi — çıkış yap, login'e gönder
            if (e.message.includes('STAFF_ACCOUNT')) {
              queryClient.clear()
              await supabase.auth.signOut()
              await secureStorage.removeItem('mobile_token')
              router.replace('/(auth)/login')
              return
            }
            // 401 = token geçersiz → oturumu temizle ve login'e yönlendir
            if (e.message.includes('401')) {
              await supabase.auth.signOut()
              await secureStorage.removeItem('mobile_token')
              await secureStorage.removeItem('login_time')
              await secureStorage.removeItem('session_expires_at')
              router.replace('/(auth)/login')
            }
          }
        }
      }
    }
    route();
  }, [ready, staffToken, session, segments]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#7C3AED' }}>
        <SplashAnimation onFinish={() => {}} />
      </View>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
    >
    <SafeAreaProvider>
    <ThemeProvider>
      <Stack screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
        animationDuration: Platform.OS === 'ios' ? 320 : 220,
      }}>
        <Stack.Screen name="(auth)/login" options={{ animation: 'fade', animationDuration: 250 }} />
        <Stack.Screen name="(auth)/onboarding" options={{ animation: 'fade', animationDuration: 250 }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', animationDuration: 200 }} />
        <Stack.Screen name="(staff)" options={{ animation: 'fade', animationDuration: 200 }} />
        <Stack.Screen name="hizmetler" />
        <Stack.Screen name="calisanlar" />
        <Stack.Screen name="finans" />
        <Stack.Screen name="ayarlar" />
        <Stack.Screen name="raporlar" />
        <Stack.Screen name="stok" />
        <Stack.Screen name="paketler" />
        <Stack.Screen name="abonelik" />
        <Stack.Screen name="musteri/[id]" />
        <Stack.Screen name="randevu/yeni" options={{ animation: 'slide_from_bottom', animationDuration: 280 }} />
        <Stack.Screen name="kampanya" />
        <Stack.Screen name="personel/[id]" />
        <Stack.Screen name="promosyon" />
        <Stack.Screen name="bildirimler" />
        <Stack.Screen name="arama" options={{ animation: 'fade', animationDuration: 200 }} />
        <Stack.Screen name="deneme-bitti" options={{ gestureEnabled: false, animation: 'fade' }} />
      </Stack>
      <FloatingDock />
      {!splashDone && <SplashAnimation onFinish={() => setSplashDone(true)} />}
    </ThemeProvider>
    </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
