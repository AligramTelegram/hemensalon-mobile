// Merkezi query key fabrikası — tenantId dahil.
// Farklı hesaba giriş yapılınca cache çakışması olmaz.

export const queryKeys = {
  dashboard:        (tid: string) => ['dashboard', tid] as const,
  appointments:     (tid: string, date?: string) => date ? ['appointments', tid, date] : ['appointments', tid],
  customers:        (tid: string) => ['customers', tid] as const,
  customer:         (tid: string, id: string) => ['customers', tid, id] as const,
  staff:            (tid: string) => ['staff', tid] as const,
  staffDetail:      (tid: string, id: string) => ['staff', tid, id] as const,
  services:         (tid: string) => ['services', tid] as const,
  products:         (tid: string) => ['products', tid] as const,
  transactions:     (tid: string, month?: string) => month ? ['transactions', tid, month] : ['transactions', tid],
  reports:          (tid: string, type: string, params: Record<string, string>) => ['reports', tid, type, params] as const,
  notifications:    (tid: string) => ['notifications', tid] as const,
  workingHours:     (tid: string) => ['workingHours', tid] as const,
  usage:            (tid: string) => ['usage', tid] as const,
  packages:         (tid: string) => ['packages', tid] as const,
  campaigns:        (tid: string) => ['campaigns', tid] as const,
  promotions:       (tid: string) => ['promotions', tid] as const,
  waitingList:      (tid: string) => ['waitingList', tid] as const,
  staffAppointments:(tid: string, date?: string) => date ? ['staffAppointments', tid, date] : ['staffAppointments', tid],
  staffCustomers:   (tid: string) => ['staffCustomers', tid] as const,
}
