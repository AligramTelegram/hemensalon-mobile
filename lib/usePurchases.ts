import { useState, useEffect, useCallback } from 'react'
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases'
import {
  getOfferings,
  purchasePackage as doPurchase,
  restorePurchases as doRestore,
  getCustomerInfo,
  isAnyPaidActive,
  type PurchaseResult,
} from './purchases'

interface PurchasesState {
  packages: PurchasesPackage[]
  customerInfo: CustomerInfo | null
  isSubscribed: boolean
  loading: boolean
  purchasing: boolean
  restoring: boolean
  error: string | null
}

export function usePurchases() {
  const [state, setState] = useState<PurchasesState>({
    packages: [],
    customerInfo: null,
    isSubscribed: false,
    loading: true,
    purchasing: false,
    restoring: false,
    error: null,
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const [pkgs, info] = await Promise.all([getOfferings(), getCustomerInfo()])
      setState(s => ({
        ...s,
        packages: pkgs,
        customerInfo: info,
        isSubscribed: info ? isAnyPaidActive(info) : false,
        loading: false,
      }))
    } catch {
      setState(s => ({ ...s, loading: false, error: 'Paketler yüklenemedi' }))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseResult> => {
    setState(s => ({ ...s, purchasing: true, error: null }))
    const result = await doPurchase(pkg)
    if (result.success) {
      setState(s => ({
        ...s,
        purchasing: false,
        customerInfo: result.customerInfo,
        isSubscribed: isAnyPaidActive(result.customerInfo),
      }))
    } else {
      setState(s => ({
        ...s,
        purchasing: false,
        error: result.cancelled ? null : result.error,
      }))
    }
    return result
  }, [])

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    setState(s => ({ ...s, restoring: true, error: null }))
    const result = await doRestore()
    if (result.success) {
      setState(s => ({
        ...s,
        restoring: false,
        customerInfo: result.customerInfo,
        isSubscribed: isAnyPaidActive(result.customerInfo),
      }))
    } else {
      setState(s => ({ ...s, restoring: false, error: result.error }))
    }
    return result
  }, [])

  return { ...state, reload: load, purchase, restore }
}
