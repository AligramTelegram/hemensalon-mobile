import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, TenantProfile, getCachedTenant } from './api'
import { TENANT_QUERY_KEY } from './useTenantId'

export type LockReason = 'trial_expired' | 'subscription_expired' | null

export type TrialStatus = {
  loading: boolean
  isTrialActive: boolean
  isTrialExpired: boolean
  isSubscriptionActive: boolean
  isSubscriptionExpired: boolean
  isLocked: boolean
  lockReason: LockReason
  daysLeft: number
  hoursLeft: number
  endsAt: Date | null
  profile: TenantProfile | null
}

function compute(profile: TenantProfile): Omit<TrialStatus, 'loading' | 'profile'> {
  const now = Date.now()
  const trialEndsAt = profile.trialEndsAt ? new Date(profile.trialEndsAt) : null
  const planEndsAt = profile.planEndsAt ? new Date(profile.planEndsAt) : null

  const subMsLeft = planEndsAt ? planEndsAt.getTime() - now : 0
  const isSubscriptionActive = !!planEndsAt && subMsLeft > 0
  const isSubscriptionExpired = !!planEndsAt && subMsLeft <= 0

  const trialMsLeft = trialEndsAt ? trialEndsAt.getTime() - now : 0
  const isTrialActive = !!trialEndsAt && trialMsLeft > 0 && !isSubscriptionActive
  const isTrialExpired = !!trialEndsAt && trialMsLeft <= 0 && !isSubscriptionActive

  const isLocked = !isTrialActive && !isSubscriptionActive
  const lockReason: LockReason = isSubscriptionExpired
    ? 'subscription_expired'
    : isTrialExpired
      ? 'trial_expired'
      : null

  const activeMsLeft = isSubscriptionActive ? subMsLeft : isTrialActive ? trialMsLeft : 0
  const daysLeft = activeMsLeft > 0 ? Math.floor(activeMsLeft / 86400000) : 0
  const hoursLeft = activeMsLeft > 0 ? Math.floor((activeMsLeft % 86400000) / 3600000) : 0
  const endsAt = isSubscriptionActive ? planEndsAt : trialEndsAt

  return { isTrialActive, isTrialExpired, isSubscriptionActive, isSubscriptionExpired, isLocked, lockReason, daysLeft, hoursLeft, endsAt }
}

export function useTrial(): TrialStatus {
  const cached = getCachedTenant()
  const { data: profile, isLoading } = useQuery({
    queryKey: TENANT_QUERY_KEY,
    queryFn: () => api.tenant.get(),
    staleTime: 5 * 60 * 1000,
    initialData: cached ?? undefined,
  })

  return useMemo<TrialStatus>(() => {
    if (!profile) {
      return {
        loading: isLoading, isTrialActive: false, isTrialExpired: false,
        isSubscriptionActive: false, isSubscriptionExpired: false,
        isLocked: false, lockReason: null, daysLeft: 0, hoursLeft: 0, endsAt: null, profile: null,
      }
    }
    return { loading: false, profile, ...compute(profile) }
  }, [profile, isLoading])
}
