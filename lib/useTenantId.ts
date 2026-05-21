import { useEffect, useState } from 'react'
import { getCachedTenant, api } from './api'

// Önce cache'den anında döner, cache boşsa API'den çeker.
export function useTenantId(): string {
  const [tid, setTid] = useState<string>(() => getCachedTenant()?.id ?? '')

  useEffect(() => {
    if (tid) return
    api.tenant.get().then(t => setTid(t.id)).catch(() => {})
  }, [tid])

  return tid
}
