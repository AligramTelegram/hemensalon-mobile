import { useTrial } from './useTrial'

export type Plan = 'TRIAL' | 'BASLANGIC' | 'PROFESYONEL' | 'ISLETME'

export type PlanFeatures = {
  plan: Plan
  loading: boolean
  // Randevu
  maxAppointmentsPerMonth: number | null  // null = sınırsız
  // Müşteri
  maxCustomers: number | null
  // Personel
  maxStaff: number
  // Ekranlar — tam erişim mi?
  hasReports: boolean       // tam raporlar (gelir analizi vs)
  hasStock: boolean         // stok yönetimi
  hasFinance: boolean       // finans ekranı
  hasPackages: boolean      // paket satışı
  hasPdfInvoice: boolean    // PDF fatura
  // Hangi üst plan önerilsin
  upgradeForReports: Plan
  upgradeForStock: Plan
  upgradeForFinance: Plan
  upgradeForPackages: Plan
  upgradeForStaff: Plan
}

function detectPlan(profilePlan?: string, isTrialActive?: boolean): Plan {
  if (!profilePlan || isTrialActive) return 'TRIAL'
  if (profilePlan === 'BASLANGIC') return 'BASLANGIC'
  if (profilePlan === 'PROFESYONEL') return 'PROFESYONEL'
  if (profilePlan === 'ISLETME') return 'ISLETME'
  return 'TRIAL'
}

export function usePlanFeatures(): PlanFeatures {
  const trial = useTrial()
  const plan = detectPlan(trial.profile?.plan, trial.isTrialActive)

  if (trial.loading) {
    return {
      plan: 'TRIAL',
      loading: true,
      maxAppointmentsPerMonth: 200,
      maxCustomers: 25,
      maxStaff: 1,
      hasReports: false,
      hasStock: false,
      hasFinance: false,
      hasPackages: false,
      hasPdfInvoice: false,
      upgradeForReports: 'PROFESYONEL',
      upgradeForStock: 'PROFESYONEL',
      upgradeForFinance: 'PROFESYONEL',
      upgradeForPackages: 'PROFESYONEL',
      upgradeForStaff: 'PROFESYONEL',
    }
  }

  switch (plan) {
    case 'ISLETME':
      return {
        plan, loading: false,
        maxAppointmentsPerMonth: null,
        maxCustomers: null,
        maxStaff: 10,
        hasReports: true,
        hasStock: true,
        hasFinance: true,
        hasPackages: true,
        hasPdfInvoice: true,
        upgradeForReports: 'ISLETME',
        upgradeForStock: 'ISLETME',
        upgradeForFinance: 'ISLETME',
        upgradeForPackages: 'ISLETME',
        upgradeForStaff: 'ISLETME',
      }

    case 'PROFESYONEL':
      return {
        plan, loading: false,
        maxAppointmentsPerMonth: 1000,
        maxCustomers: 150,
        maxStaff: 3,
        hasReports: true,
        hasStock: true,
        hasFinance: true,
        hasPackages: true,
        hasPdfInvoice: false,
        upgradeForReports: 'ISLETME',
        upgradeForStock: 'ISLETME',
        upgradeForFinance: 'ISLETME',
        upgradeForPackages: 'ISLETME',
        upgradeForStaff: 'ISLETME',
      }

    case 'BASLANGIC':
      return {
        plan, loading: false,
        maxAppointmentsPerMonth: 200,
        maxCustomers: 25,
        maxStaff: 1,
        hasReports: false,
        hasStock: false,
        hasFinance: false,
        hasPackages: false,
        hasPdfInvoice: false,
        upgradeForReports: 'PROFESYONEL',
        upgradeForStock: 'PROFESYONEL',
        upgradeForFinance: 'PROFESYONEL',
        upgradeForPackages: 'PROFESYONEL',
        upgradeForStaff: 'PROFESYONEL',
      }

    default: // TRIAL
      return {
        plan, loading: false,
        maxAppointmentsPerMonth: 200,
        maxCustomers: 25,
        maxStaff: 1,
        hasReports: false,
        hasStock: false,
        hasFinance: false,
        hasPackages: false,
        hasPdfInvoice: false,
        upgradeForReports: 'PROFESYONEL',
        upgradeForStock: 'PROFESYONEL',
        upgradeForFinance: 'PROFESYONEL',
        upgradeForPackages: 'PROFESYONEL',
        upgradeForStaff: 'PROFESYONEL',
      }
  }
}

export const PLAN_LABELS: Record<Plan, string> = {
  TRIAL: 'Deneme',
  BASLANGIC: 'Başlangıç',
  PROFESYONEL: 'Profesyonel',
  ISLETME: 'İşletme',
}

export const PLAN_COLORS: Record<Plan, string> = {
  TRIAL: '#6B7280',
  BASLANGIC: '#2563EB',
  PROFESYONEL: '#7C3AED',
  ISLETME: '#D97706',
}
