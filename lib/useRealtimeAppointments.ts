import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { queryKeys } from './queryKeys'

// appointments tablosunu Supabase Realtime ile dinler.
// INSERT/UPDATE/DELETE gelince ilgili React Query cache'lerini iptal eder
// ve arka planda yeniden fetch başlatır.
// Sadece Dashboard ve Appointments ekranlarında kullanılır — diğer tablolarda açmaya gerek yok.
export function useRealtimeAppointments(tenantId?: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!tenantId) return

    const channel = supabase
      .channel(`appointments:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `tenantId=eq.${tenantId}`,
        },
        () => {
          // Tüm appointments cache'lerini ve dashboard'u sıfırla
          queryClient.invalidateQueries({ queryKey: ['appointments'] })
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(tenantId) })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])
}
