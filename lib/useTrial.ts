import { useEffect, useState } from 'react'
import { api, TenantProfile } from './api'

export type LockReason = 'trial_expired' | 'subscription_expired' | null

export type TrialStatus = {
  loading: boolean
  isTrialActive: boolean        // deneme süresi içinde
  isTrialExpired: boolean       // deneme bitti, ödeme yok
  isSubscriptionActive: boolean // ücretli plan geçerli
  isSubscriptionExpired: boolean// ücretli plan süresi doldu
  isLocked: boolean             // uygulama kilitli mi (herhangi bir sebepten)
  lockReason: LockReason
  daysLeft: number              // deneme veya abonelik için kalan gün
  hoursLeft: number             // kalan saat (daysLeft 0 iken)
  endsAt: Date | null           // aktif olan tarihin bitişi
  profile: TenantProfile | null
}

export function useTrial(): TrialStatus {
  const [status, setStatus] = useState<TrialStatus>({
    loading: true,
    isTrialActive: false,
    isTrialExpired: false,
    isSubscriptionActive: false,
    isSubscriptionExpired: false,
    isLocked: false,
    lockReason: null,
    daysLeft: 0,
    hoursLeft: 0,
    endsAt: null,
    profile: null,
  })

  useEffect(() => {
    api.tenant.get().then(profile => {
      compute(profile)
    }).catch(() => {
      setStatus(s => ({ ...s, loading: false }))
    })
  }, [])

  function compute(profile: TenantProfile) {
    const now = Date.now()

    const trialEndsAt = profile.trialEndsAt ? new Date(profile.trialEndsAt) : null
    const planEndsAt = profile.planEndsAt ? new Date(profile.planEndsAt) : null

    // Deneme durumu — trialEndsAt varsa trial kullanıcısı
    const trialMsLeft = trialEndsAt ? trialEndsAt.getTime() - now : 0
    const isTrialActive = !!trialEndsAt && trialMsLeft > 0 && !planEndsAt
    const isTrialExpired = !!trialEndsAt && trialMsLeft <= 0 && !planEndsAt

    // Abonelik durumu — planEndsAt varsa ücretli kullanıcı
    const subMsLeft = planEndsAt ? planEndsAt.getTime() - now : 0
    const isSubscriptionActive = !!planEndsAt && subMsLeft > 0
    const isSubscriptionExpired = !!planEndsAt && subMsLeft <= 0

    // Kilit: ne trial aktif ne ücretli plan aktif
    const isLocked = !isTrialActive && !isSubscriptionActive
    const lockReason: LockReason = isTrialExpired
      ? 'trial_expired'
      : isSubscriptionExpired
        ? 'subscription_expired'
        : null

    // Kalan süre hesabı
    const activeMsLeft = isSubscriptionActive ? subMsLeft : isTrialActive ? trialMsLeft : 0
    const daysLeft = activeMsLeft > 0 ? Math.floor(activeMsLeft / 86400000) : 0
    const hoursLeft = activeMsLeft > 0 ? Math.floor((activeMsLeft % 86400000) / 3600000) : 0
    const endsAt = isSubscriptionActive ? planEndsAt : trialEndsAt

    setStatus({
      loading: false,
      isTrialActive,
      isTrialExpired,
      isSubscriptionActive,
      isSubscriptionExpired,
      isLocked,
      lockReason,
      daysLeft,
      hoursLeft,
      endsAt,
      profile,
    })
  }

  return status
}
