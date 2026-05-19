import useSWR from 'swr'
import { api } from './api'

const MINUTE = 60 * 1000

export function useCustomers() {
  return useSWR('customers', () => api.customers.list(), { dedupingInterval: 2 * MINUTE })
}

export function useStaff() {
  return useSWR('staff', () => api.staff.list(), { dedupingInterval: 5 * MINUTE })
}

export function useServices() {
  return useSWR('services', () => api.services.list(), { dedupingInterval: 5 * MINUTE })
}

export function useTenant() {
  return useSWR('tenant', () => api.tenant.get(), { dedupingInterval: 5 * MINUTE })
}

export function useTenantUsage() {
  return useSWR('tenant-usage', () => api.tenant.usage(), { dedupingInterval: 2 * MINUTE })
}

export function useDashboardStats() {
  return useSWR('dashboard-stats', () => api.dashboard.stats(), { dedupingInterval: 1 * MINUTE })
}

export function useAppointments(date: string) {
  return useSWR(['appointments', date], () => api.appointments.list({ date }), { dedupingInterval: 30 * 1000 })
}

export function useAppointmentRange(from: string, to: string) {
  return useSWR(['appointments-range', from, to], () => api.appointments.list({ from, to }), { dedupingInterval: 30 * 1000 })
}

export function useNotifications() {
  return useSWR('notifications', () => api.notifications.list(), { dedupingInterval: 1 * MINUTE })
}
