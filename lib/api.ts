import { supabase } from './supabase'
import { secureStorage } from './secureStorage'

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://app.hemensalon.com'

async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  // Staff ve mobile token'ı paralel oku
  const [staffToken, mobileToken] = await Promise.all([
    secureStorage.getItem('staff_token'),
    secureStorage.getItem('mobile_token').catch(() => null),
  ])

  if (__DEV__) {
    console.log('[api:getHeaders]', { staffTokenPresent: !!staffToken, mobileTokenPresent: !!mobileToken })
  }

  // Staff oturumu: mobile_token (gerçek JWT) kullan, Supabase session'a gerek yok
  if (staffToken) {
    let activeToken = mobileToken
    // Token süresi dolduysa refresh_token ile yenile
    if (activeToken) {
      try {
        const payload = JSON.parse(atob(activeToken.split('.')[1]))
        const expiring = payload.exp * 1000 < Date.now() + 60_000
        if (expiring) {
          const refreshToken = await secureStorage.getItem('refresh_token')
          if (refreshToken) {
            const { createClient: createSB } = await import('@supabase/supabase-js')
            const sb = createSB(
              process.env.EXPO_PUBLIC_SUPABASE_URL!,
              process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
              { auth: { autoRefreshToken: false, persistSession: false } }
            )
            const { data } = await sb.auth.refreshSession({ refresh_token: refreshToken })
            if (data.session?.access_token) {
              activeToken = data.session.access_token
              await secureStorage.setItem('mobile_token', activeToken)
              if (data.session.refresh_token) {
                await secureStorage.setItem('refresh_token', data.session.refresh_token)
              }
            }
          }
        }
      } catch {}
    }
    if (activeToken) {
      headers['x-mobile-token'] = activeToken
      headers['Authorization'] = `Bearer ${activeToken}`
    }
    return headers
  }

  let { data: { session } } = await supabase.auth.getSession()

  // Token süresi dolduysa veya 60 saniye içinde dolacaksa yenile
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data } = await supabase.auth.refreshSession()
    session = data.session
    if (session?.access_token) {
      await secureStorage.setItem('mobile_token', session.access_token)
    }
  }

  let accessToken = session?.access_token

  // Hâlâ token yoksa önceden okunan mobileToken'ı kullan
  if (!accessToken && mobileToken) {
    const refreshToken = await secureStorage.getItem('refresh_token')
    if (refreshToken) {
      const { data } = await supabase.auth.refreshSession({ refresh_token: refreshToken }).catch(() => ({ data: { session: null } }))
      accessToken = data.session?.access_token ?? mobileToken
      if (data.session?.access_token) {
        await secureStorage.setItem('mobile_token', data.session.access_token)
      }
    } else {
      accessToken = mobileToken
    }
  }

  if (accessToken) {
    headers['x-mobile-token'] = accessToken
    headers['Authorization'] = `Bearer ${accessToken}`
    if (__DEV__) console.log('[api:getHeaders] using mobile Authorization Bearer')
  } else if (__DEV__) {
    console.log('[api:getHeaders] no access token resolved')
  }

  return headers
}

// ─── Tenant profile cache (route guard'ın her segment değişiminde HTTP yapmasını önler) ──
let _tenantCache: { data: TenantProfile; ts: number } | null = null
const TENANT_CACHE_TTL = 2 * 60 * 1000 // 2 dakika

export function getCachedTenant(): TenantProfile | null {
  if (_tenantCache && Date.now() - _tenantCache.ts < TENANT_CACHE_TTL) return _tenantCache.data
  return null
}
export function setCachedTenant(data: TenantProfile) {
  _tenantCache = { data, ts: Date.now() }
}
export function invalidateTenantCache() {
  _tenantCache = null
}

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanLimitError'
  }
}

const TIMEOUT_MS = 15000

function withTimeout(signal?: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  if (signal) signal.addEventListener('abort', () => controller.abort())
  controller.signal.addEventListener('abort', () => clearTimeout(timer))
  return controller.signal
}

const _cache = new Map<string, { data: unknown; at: number }>()
const CACHE_TTL = 30_000 // 30 saniye

export function invalidateCache(prefix?: string) {
  if (!prefix) { _cache.clear(); return }
  for (const k of _cache.keys()) { if (k.startsWith(prefix)) _cache.delete(k) }
}

async function get<T>(path: string, params?: Record<string, string>, ttl = CACHE_TTL): Promise<T> {
  const url = new URL(path, BASE)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const cacheKey = url.toString()
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() - cached.at < ttl) return cached.data as T
  const res = await fetch(url.toString(), { headers: await getHeaders(), signal: withTimeout() })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    console.warn(`API GET failed: ${url.toString()}`, res.status, data)
    throw new Error(data?.error ?? `GET ${path} → ${res.status}`)
  }
  _cache.set(cacheKey, { data, at: Date.now() })
  return data
}

async function post<T>(path: string, body: unknown): Promise<T> {
  invalidateCache(new URL(path, BASE).pathname.split('/').slice(0, 4).join('/'))
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
    signal: withTimeout(),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    console.warn(`API POST failed: ${BASE}${path}`, res.status, data)
    if (res.status === 402 || res.status === 403) throw new PlanLimitError(data?.error ?? 'Plan limiti aşıldı')
    throw new Error(data?.error ?? `POST ${path} → ${res.status}`)
  }
  return data
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: await getHeaders(),
    body: JSON.stringify(body),
    signal: withTimeout(),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    console.warn(`API PUT failed: ${BASE}${path}`, res.status, data)
    if (res.status === 402 || res.status === 403) throw new PlanLimitError(data?.error ?? 'Plan limiti aşıldı')
    throw new Error(data?.error ?? `PUT ${path} → ${res.status}`)
  }
  return data
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: await getHeaders(),
    body: JSON.stringify(body),
    signal: withTimeout(),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    console.warn(`API PATCH failed: ${BASE}${path}`, res.status, data)
    throw new Error(data?.error ?? `PATCH ${path} → ${res.status}`)
  }
  return data
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: await getHeaders(),
    signal: withTimeout(),
  })
  if (!res.ok) {
    console.warn(`API DELETE failed: ${BASE}${path}`, res.status)
    throw new Error(`DELETE ${path} → ${res.status}`)
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export type DashboardStats = {
  today: number
  month: number
  revenue: number
  expense: number
  netProfit: number
  customersCount: number
  smsUsed: number
  smsCredits: number
  recentAppointments: Appointment[]
}

export type Appointment = {
  id: string
  status: 'BEKLIYOR' | 'ONAYLANDI' | 'TAMAMLANDI' | 'IPTAL' | 'GELMEDI'
  date: string
  startTime: string
  endTime: string
  price: number
  paid?: boolean
  notes?: string
  customer: { id: string; name: string; phone: string }
  service: { id: string; name: string; duration: number; color: string }
  staff: { id: string; name: string; color: string } | null
}

export type Customer = {
  id: string
  name: string
  phone: string
  email?: string
  notes?: string
  birthday?: string
  totalVisits: number
  totalSpent: number
  lastVisitAt?: string
  appointments?: {
    id: string; date: string; startTime: string; endTime: string
    status: string; price: number
    service: { name: string; color: string }
    staff?: { name: string }
  }[]
}

export type Service = {
  id: string
  name: string
  duration: number
  price: number
  color: string
  isActive: boolean
}

export type Staff = {
  id: string
  name: string
  email?: string
  phone?: string
  color: string
  title?: string
  isActive: boolean
  services: { id: string; name: string }[]
}

export type Transaction = {
  id: string
  type: 'GELIR' | 'GIDER'
  amount: number
  category: string
  description?: string
  date: string
  paymentMethod?: 'NAKIT' | 'KART' | 'ONLINE'
  isDebt?: boolean
}

export type ServiceRevenue = {
  serviceId: string
  serviceName: string
  serviceColor: string
  count: number
  revenue: number
}

export type StaffRevenue = {
  staffId: string
  staffName: string
  staffColor: string
  count: number
  revenue: number
}

export type TransactionStats = {
  revenue: number
  expense: number
  netProfit: number
}

export type Package = {
  id: string
  name: string
  description?: string
  serviceId: string
  sessions: number
  price: number
  validDays?: number
  isActive: boolean
  service: { id: string; name: string; color: string; duration: number }
  _count: { customerPackages: number }
}

export type Promotion = {
  id: string
  code: string
  discountType: 'PERCENT' | 'FIXED'
  discountValue: number
  maxUses?: number
  usedCount: number
  expiresAt?: string
  isActive: boolean
  description?: string
}

export type WorkingHour = {
  id?: string
  dayOfWeek: number  // 0=Paz, 1=Pzt … 6=Cmt
  isOpen: boolean
  openTime: string
  closeTime: string
}

export type Campaign = {
  id: string
  subject: string
  body: string
  segment: 'ALL' | 'VIP' | 'KAYIP' | 'RISK' | 'YENI'
  sentAt: string
  recipientCount: number
  status: 'QUEUED' | 'SENT' | 'FAILED'
}

export type Leave = {
  id: string
  staffId: string
  type: 'IZIN' | 'TATIL' | 'HASTALIK' | 'DIGER'
  startDate: string
  endDate: string
  reason?: string
  createdAt: string
}

export type StaffDetail = Staff & {
  commissionRate?: number
  appointments: {
    id: string; date: string; startTime: string; status: string; price: number
    customer: { name: string }
    service: { name: string; color: string }
  }[]
  monthStats: { count: number; revenue: number; completedCount: number }
}

export type StockMovement = {
  id: string
  type: 'GIRIS' | 'CIKIS'
  quantity: number
  note?: string
  createdAt: string
}

export type CustomerNote = {
  id: string
  content: string
  category: 'GENEL' | 'ALERJI' | 'TERCIH' | 'OZEL'
  createdAt: string
}

export type CustomerPackage = {
  id: string
  customerId: string
  packageId: string
  sessionsLeft: number
  sessionsTotal: number
  purchasedAt: string
  expiresAt?: string
  isActive: boolean
  package: { id: string; name: string; service: { name: string; color: string } }
}

export type Product = {
  id: string
  name: string
  category?: string
  unit: string
  quantity: number
  minQuantity: number
  costPrice?: number
  sellPrice?: number
  isActive: boolean
}

export type WaitingEntry = {
  id: string
  customerName: string
  customerPhone: string
  serviceId?: string
  serviceName?: string
  preferredDate?: string
  preferredTime?: string
  notes?: string
  status: 'BEKLIYOR' | 'BILDIRILDI' | 'IPTAL'
  createdAt: string
}

export type Notification = {
  id: string
  customerName: string
  serviceName: string
  status: string
  statusLabel: string
  startTime: string
  date: string
  timeAgo: string
  isNew: boolean
}

export type ReminderSettings = {
  remind24h: boolean
  remind2h: boolean
}

export type PlanUsage = {
  plan: string
  appointmentsThisMonth: number
  maxAppointmentsPerMonth: number | null
  staffCount: number
  maxStaff: number | null
  customerCount: number
  maxCustomers: number | null
  serviceCount: number
  maxServices: number | null
  pct: { appointments: number; staff: number; customers: number; services: number }
}

export type TenantProfile = {
  id: string
  name: string
  slug: string
  phone?: string
  email?: string
  address?: string
  country?: string
  sector?: string
  plan: string
  planEndsAt?: string
  trialEndsAt?: string
  smsUsed: number
  smsCredits: number
  smsMonthlyLimit: number
  isTurkish: boolean
  reminderSettings?: ReminderSettings
  ownerName?: string
  ownerPhone?: string
  ownerEmail?: string
  ownerIdNumber?: string
  ownerAddress?: string
  ownerCity?: string
  taxNumber?: string
  taxOffice?: string
}

// ── API calls ──────────────────────────────────────────────────────────────

// ── Staff Portal API (uses real Supabase JWT via x-mobile-token) ───────────
export const staffApi = {
  appointments: {
    list: (params?: Record<string, string>) => get<Appointment[]>('/api/staff/appointments', params),
    update: (id: string, body: Partial<{ status: string; paid: boolean }>) =>
      put<Appointment>(`/api/staff/appointments/${id}`, body),
  },
  customers: {
    list: (q?: string) => get<Customer[]>('/api/staff/customers', q ? { q } : undefined),
  },
  services: {
    list: () => get<Service[]>('/api/services?all=true'),
  },
  me: () => get<{ id: string; name: string; phone?: string; title?: string; color: string; tenant: { name: string; slug: string } }>('/api/staff/me'),
}

export const api = {
  dashboard: {
    stats: () => get<DashboardStats>('/api/dashboard/stats'),
  },
  appointments: {
    list: (params?: Record<string, string>) => get<Appointment[]>('/api/appointments', params),
    create: (body: {
      customerId: string; serviceId: string; staffId: string
      date: string; startTime: string; endTime: string; price: number; notes?: string
    }) => post<Appointment>('/api/appointments', body),
    update: (id: string, body: Partial<{ status: string; paid: boolean; notes: string; date: string; startTime: string; endTime: string; staffId: string; price: number }>) =>
      put<Appointment>(`/api/appointments/${id}`, body),
  },
  customers: {
    list: (q?: string) => get<Customer[]>('/api/customers', q ? { q } : undefined),
    get: (id: string) => get<Customer>(`/api/customers/${id}`),
    create: (body: { name: string; phone: string; email?: string; notes?: string; birthday?: string }) =>
      post<Customer>('/api/customers', body),
    update: (id: string, body: Partial<Customer>) => put<Customer>(`/api/customers/${id}`, body),
    delete: (id: string) => del(`/api/customers/${id}`),
  },
  pushToken: {
    register: (pushToken: string) => patch('/api/me/push-token', { pushToken }),
    registerStaff: (token: string) => post('/api/staff/push-token', { token }),
  },
  staff: {
    list: () => get<Staff[]>('/api/staff', { all: 'true' }),
    create: (body: { name: string; email?: string; phone?: string; color: string; title?: string; password?: string }) =>
      post<Staff>('/api/staff/create', body),
    update: (id: string, body: Partial<Staff>) => put<Staff>(`/api/staff/${id}`, body),
    delete: (id: string) => del(`/api/staff/${id}`),
  },
  services: {
    list: () => get<Service[]>('/api/services?all=true'),
    create: (body: { name: string; duration: number; price: number; color: string; description?: string }) =>
      post<Service>('/api/services', body),
    update: (id: string, body: Partial<Service>) => put<Service>(`/api/services/${id}`, body),
    delete: (id: string) => del(`/api/services/${id}`),
  },
  transactions: {
    list: (period?: string) => get<Transaction[]>('/api/transactions', period ? { period } : undefined),
    stats: (period?: string) => get<TransactionStats>('/api/transactions/stats', period ? { period } : undefined),
    create: (body: { type: 'GELIR' | 'GIDER'; amount: number; category: string; description?: string; date: string; paymentMethod?: string; isDebt?: boolean }) =>
      post<Transaction>('/api/transactions', body),
    update: (id: string, body: Partial<Transaction>) => put<Transaction>(`/api/transactions/${id}`, body),
    delete: (id: string) => del(`/api/transactions/${id}`),
  },
  reports: {
    serviceRevenue: (period?: string) => get<ServiceRevenue[]>('/api/reports/service-revenue', period ? { period } : undefined),
    staffRevenue: (period?: string) => get<StaffRevenue[]>('/api/reports/staff-revenue', period ? { period } : undefined),
  },
  tenant: {
    get: () => get<TenantProfile>('/api/me'),
    update: (body: Partial<TenantProfile>) => put<TenantProfile>('/api/me', body),
    usage: () => get<PlanUsage>('/api/me/usage'),
  },
  reminders: {
    getSettings: () => get<ReminderSettings>('/api/me/reminder-settings'),
    updateSettings: (body: ReminderSettings) => put<ReminderSettings>('/api/me/reminder-settings', body),
  },
  packages: {
    list: () => get<Package[]>('/api/packages'),
    create: (body: { name: string; serviceId: string; sessions: number; price: number; description?: string; validDays?: number }) =>
      post<Package>('/api/packages', body),
    update: (id: string, body: Partial<{ name: string; sessions: number; price: number; description: string; validDays: number | null; isActive: boolean }>) =>
      put<Package>(`/api/packages/${id}`, body),
    delete: (id: string) => del(`/api/packages/${id}`),
  },
  notifications: {
    list: () => get<Notification[]>('/api/notifications'),
  },
  promotions: {
    list: () => get<Promotion[]>('/api/promotions'),
    create: (body: { code: string; discountType: 'PERCENT' | 'FIXED'; discountValue: number; maxUses?: number; expiresAt?: string; description?: string }) =>
      post<Promotion>('/api/promotions', body),
    update: (id: string, body: Partial<{ isActive: boolean; maxUses: number; expiresAt: string; description: string }>) =>
      put<Promotion>(`/api/promotions/${id}`, body),
    delete: (id: string) => del(`/api/promotions/${id}`),
  },
  workingHours: {
    list: () => get<WorkingHour[]>('/api/working-hours'),
    update: (hours: WorkingHour[]) => put<WorkingHour[]>('/api/working-hours', { hours }),
  },
  campaigns: {
    list: () => get<Campaign[]>('/api/campaigns'),
    create: (body: { subject: string; body: string; segment: string }) =>
      post<Campaign>('/api/campaigns', body),
  },
  staffDetail: {
    get: (id: string) => get<StaffDetail>(`/api/staff/${id}`),
    updateSchedule: (id: string, body: { workDays: number[]; startTime: string; endTime: string }) =>
      patch<Staff>(`/api/staff/${id}/schedule`, body),
  },
  leaves: {
    list: (staffId: string) => get<Leave[]>(`/api/staff/${staffId}/leaves`),
    create: (staffId: string, body: { type: string; startDate: string; endDate: string; reason?: string }) =>
      post<Leave>(`/api/staff/${staffId}/leaves`, body),
    delete: (staffId: string, leaveId: string) => del(`/api/staff/${staffId}/leaves/${leaveId}`),
  },
  customerPackages: {
    list: (customerId: string) => get<CustomerPackage[]>(`/api/customers/${customerId}/packages`),
    sell: (customerId: string, packageId: string) =>
      post<CustomerPackage>(`/api/customers/${customerId}/packages`, { packageId }),
    useSession: (id: string) =>
      patch<CustomerPackage>(`/api/customer-packages/${id}/use`, {}),
  },
  products: {
    list: () => get<Product[]>('/api/products'),
    create: (body: { name: string; category?: string; unit?: string; quantity?: number; minQuantity?: number; costPrice?: number; sellPrice?: number }) =>
      post<Product>('/api/products', body),
    update: (id: string, body: Partial<Product>) => put<Product>(`/api/products/${id}`, body),
    movement: (id: string, type: 'GIRIS' | 'CIKIS', quantity: number, note?: string) =>
      patch<Product>(`/api/products/${id}`, { type, quantity, note }),
    delete: (id: string) => del(`/api/products/${id}`),
  },
  stockMovements: {
    list: (productId: string) => get<StockMovement[]>(`/api/products/${productId}/movements`),
  },
  waitingList: {
    list: () => get<WaitingEntry[]>('/api/waiting-list'),
    create: (body: { customerName: string; customerPhone: string; serviceId?: string; preferredDate?: string; preferredTime?: string; notes?: string }) =>
      post<WaitingEntry>('/api/waiting-list', body),
    update: (id: string, body: Partial<{ status: string; notes: string }>) =>
      put<WaitingEntry>(`/api/waiting-list/${id}`, body),
    delete: (id: string) => del(`/api/waiting-list/${id}`),
  },
  customerNotes: {
    list: (customerId: string) => get<CustomerNote[]>(`/api/customers/${customerId}/notes`),
    create: (customerId: string, body: { content: string; category: string }) =>
      post<CustomerNote>(`/api/customers/${customerId}/notes`, body),
    delete: (customerId: string, noteId: string) => del(`/api/customers/${customerId}/notes/${noteId}`),
  },
}
