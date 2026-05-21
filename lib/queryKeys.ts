// Merkezi query key fabrikası — tüm useQuery çağrıları buradan key alır.
// Böylece invalidateQueries çağrısı tutarlı ve tip-güvenli olur.

export const queryKeys = {
  dashboard:        () => ['dashboard'] as const,
  appointments:     (date?: string) => date ? ['appointments', date] : ['appointments'],
  customers:        () => ['customers'] as const,
  customer:         (id: string) => ['customers', id] as const,
  staff:            () => ['staff'] as const,
  staffDetail:      (id: string) => ['staff', id] as const,
  services:         () => ['services'] as const,
  products:         () => ['products'] as const,
  transactions:     (month?: string) => month ? ['transactions', month] : ['transactions'],
  reports:          (type: string, params: Record<string, string>) => ['reports', type, params] as const,
  notifications:    () => ['notifications'] as const,
  workingHours:     () => ['workingHours'] as const,
  usage:            () => ['usage'] as const,
  packages:         () => ['packages'] as const,
  campaigns:        () => ['campaigns'] as const,
  promotions:       () => ['promotions'] as const,
  waitingList:      () => ['waitingList'] as const,
  staffAppointments:(date?: string) => date ? ['staffAppointments', date] : ['staffAppointments'],
  staffCustomers:   () => ['staffCustomers'] as const,
}
