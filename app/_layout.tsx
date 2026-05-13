import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { detectCountry } from '@/lib/pricing';
import { initI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { View, ActivityIndicator, I18nManager } from 'react-native';
import { isRTL } from '@/lib/i18n';
import * as Notifications from 'expo-notifications';
import { api, getCachedTenant, setCachedTenant } from '@/lib/api';
import { initPurchases } from '@/lib/purchases';
import type { Session } from '@supabase/supabase-js';
import { ThemeProvider } from '@/lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage'
import { secureStorage } from '@/lib/secureStorage';
import { scheduleTips } from '@/lib/scheduleTips';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [staffToken, setStaffToken] = useState<string | null>(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    async function setup() {
      const country = await detectCountry();
      await initI18n(country);
      I18nManager.forceRTL(isRTL());

      // Supabase session kontrolü
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);

      // Staff token kontrolü
      const st = await secureStorage.getItem('staff_token');
      setStaffToken(st);

      if (s) {
        try {
          // RevenueCat'i kullanıcı ID'siyle başlat
          await initPurchases(s.user.id)
        } catch {}
        try {
          const { status } = await Notifications.requestPermissionsAsync();
          if (status === 'granted') {
            const tokenData = await Notifications.getExpoPushTokenAsync();
            await api.pushToken.register(tokenData.data);
            await scheduleTips();
          }
        } catch {}
      }

      setReady(true);
    }
    setup();

    const sub = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Sadece aktif çıkış yapıldığında staff verilerini temizle
      // INITIAL_SESSION event'inde temizleme — staff mobile_token ile giriş yaptıysa silinmesin
      if (event === 'SIGNED_OUT') {
        secureStorage.removeItem('staff_token');
        secureStorage.removeItem('staff_data');
        secureStorage.removeItem('mobile_token');
        secureStorage.removeItem('refresh_token');
        setStaffToken(null);
      }
    });

    // Supabase v2'de dönüş tipine göre (subscription objesi ya doğrudan ya da data içinde olabilir)
    return () => {
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
          // Hata durumunda kullanıcıyı kilitlememek için paywall yönlendirmesini atla
        }
      }
    }
    route();
  }, [ready, staffToken, session, segments]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF8FF' }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(staff)" />
        <Stack.Screen name="hizmetler" />
        <Stack.Screen name="calisanlar" />
        <Stack.Screen name="finans" />
        <Stack.Screen name="ayarlar" />
        <Stack.Screen name="raporlar" />
        <Stack.Screen name="stok" />
        <Stack.Screen name="paketler" />
        <Stack.Screen name="abonelik" />
        <Stack.Screen name="musteri/[id]" />
        <Stack.Screen name="randevu/yeni" />
        <Stack.Screen name="kampanya" />
        <Stack.Screen name="personel/[id]" />
        <Stack.Screen name="promosyon" />
        <Stack.Screen name="bildirimler" />
        <Stack.Screen name="arama" />
        <Stack.Screen name="deneme-bitti" options={{ gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
