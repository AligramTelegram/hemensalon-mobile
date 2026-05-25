import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
  type CustomerInfo,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases'
import { Platform } from 'react-native'
import Constants from 'expo-constants'

const isExpoGo = Constants.appOwnership === 'expo'

// ─── RevenueCat API Anahtarları ───────────────────────────────────────────────
// app.revenuecat.com → Apps → API Keys bölümünden alınır
const RC_API_KEY_IOS     = process.env.EXPO_PUBLIC_RC_IOS_KEY     ?? ''
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? ''

// ─── Entitlement & Offering ───────────────────────────────────────────────────
// RevenueCat dashboard'da tanımladığın entitlement ID
export const ENTITLEMENT_PRO      = 'professional'
export const ENTITLEMENT_BUSINESS = 'business'
export const ENTITLEMENT_STARTER  = 'starter'

// RevenueCat dashboard'daki Offering identifier
export const OFFERING_DEFAULT = 'default'

// ─── Plan → Entitlement eşlemesi ──────────────────────────────────────────────
export const PLAN_ENTITLEMENT: Record<string, string> = {
  BASLANGIC:    ENTITLEMENT_STARTER,
  PROFESYONEL:  ENTITLEMENT_PRO,
  ISLETME:      ENTITLEMENT_BUSINESS,
}

// ─── Init ─────────────────────────────────────────────────────────────────────
let _configured = false

export async function initPurchases(userId?: string) {
  if (isExpoGo) return  // Expo Go'da native store yok, sessizce atla
  const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID
  if (!apiKey) return
  if (_configured) return

  Purchases.setLogLevel(LOG_LEVEL.ERROR)
  Purchases.configure({ apiKey, appUserID: userId ?? null })
  _configured = true

  // RC offerings logla — paket ID'lerini doğrulamak için
  Purchases.getOfferings().then((o) => {
    const pkgs = o.current?.availablePackages ?? []
    console.log('[RevenueCat] offerings:', pkgs.map(p => p.product.identifier))
  }).catch(() => {})
}

// ─── Mevcut teklifleri getir ──────────────────────────────────────────────────
export async function getOfferings(): Promise<PurchasesPackage[]> {
  try {
    const offerings = await Purchases.getOfferings()
    const current = offerings.current ?? offerings.all[OFFERING_DEFAULT]
    return current?.availablePackages ?? []
  } catch {
    return []
  }
}

// ─── Satın al ─────────────────────────────────────────────────────────────────
export type PurchaseResult =
  | { success: true;  customerInfo: CustomerInfo }
  | { success: false; cancelled: boolean; error: string }

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg)
    return { success: true, customerInfo }
  } catch (e: any) {
    const cancelled = e?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
    return { success: false, cancelled, error: e?.message ?? 'Satın alma başarısız' }
  }
}

// ─── Satın alımları geri yükle ────────────────────────────────────────────────
export async function restorePurchases(): Promise<PurchaseResult> {
  try {
    const customerInfo = await Purchases.restorePurchases()
    return { success: true, customerInfo }
  } catch (e: any) {
    return { success: false, cancelled: false, error: e?.message ?? 'Geri yükleme başarısız' }
  }
}

// ─── Aktif entitlement kontrol ────────────────────────────────────────────────
export function getActiveEntitlements(customerInfo: CustomerInfo): string[] {
  return Object.keys(customerInfo.entitlements.active)
}

export function hasEntitlement(customerInfo: CustomerInfo, id: string): boolean {
  return !!customerInfo.entitlements.active[id]
}

export function isAnyPaidActive(customerInfo: CustomerInfo): boolean {
  return (
    hasEntitlement(customerInfo, ENTITLEMENT_PRO) ||
    hasEntitlement(customerInfo, ENTITLEMENT_BUSINESS) ||
    hasEntitlement(customerInfo, ENTITLEMENT_STARTER)
  )
}

// ─── CustomerInfo ─────────────────────────────────────────────────────────────
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo()
  } catch {
    return null
  }
}
