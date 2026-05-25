import { useQuery } from '@tanstack/react-query'
import { getCachedTenant, api } from './api'

const TENANT_QUERY_KEY = ['tenant-profile']

export function useTenantId(): string {
  const cached = getCachedTenant()
  const { data } = useQuery({
    queryKey: TENANT_QUERY_KEY,
    queryFn: () => api.tenant.get(),
    staleTime: 5 * 60 * 1000,
    initialData: cached ?? undefined,
  })
  return data?.id ?? ''
}

export { TENANT_QUERY_KEY }
