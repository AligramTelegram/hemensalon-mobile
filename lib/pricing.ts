import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PricingData {
  country: string;
  currency: string;
  symbol: string;
  starter: number;
  professional: number;
  business: number;
}

const PRICING: Record<string, PricingData> = {
  TR: { country: 'TR', currency: 'TRY', symbol: '₺', starter: 599, professional: 1299, business: 1799 },
  US: { country: 'US', currency: 'USD', symbol: '$', starter: 16, professional: 34, business: 49 },
  DE: { country: 'DE', currency: 'EUR', symbol: '€', starter: 15, professional: 32, business: 45 },
  AE: { country: 'AE', currency: 'AED', symbol: 'د.إ', starter: 62, professional: 129, business: 179 },
  GB: { country: 'GB', currency: 'GBP', symbol: '£', starter: 13, professional: 27, business: 39 },
};

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  TRY: 'TR', USD: 'US', EUR: 'DE', AED: 'AE', GBP: 'GB',
};

const LANG_TO_COUNTRY: Record<string, string> = {
  tr: 'TR', de: 'DE', ar: 'AE', en: 'US',
};

let _cachedCountry: string | null = null
let _pending: Promise<string> | null = null

export async function detectCountry(): Promise<string> {
  if (_cachedCountry) return _cachedCountry
  if (_pending) return _pending
  _pending = _detect().finally(() => { _pending = null })
  return _pending
}

async function _detect(): Promise<string> {
  if (_cachedCountry) return _cachedCountry

  // 1. Kullanıcının kaydettiği para birimi tercihi
  try {
    const savedCurrency = await AsyncStorage.getItem('pref_currency');
    if (savedCurrency && CURRENCY_TO_COUNTRY[savedCurrency]) {
      _cachedCountry = CURRENCY_TO_COUNTRY[savedCurrency]
      return _cachedCountry
    }
  } catch { /* ignore */ }

  // 2. Seçili dile göre
  try {
    const savedLang = await AsyncStorage.getItem('pref_language');
    if (savedLang && LANG_TO_COUNTRY[savedLang]) {
      _cachedCountry = LANG_TO_COUNTRY[savedLang]
      return _cachedCountry
    }
  } catch { /* ignore */ }

  // 3. Cihaz locale'inden ülke tespiti
  try {
    const { getLocales } = await import('expo-localization')
    const locales = getLocales()
    const region = locales[0]?.regionCode
    if (region && (PRICING[region] || region === 'TR')) {
      _cachedCountry = region
      return _cachedCountry
    }
  } catch { /* ignore */ }

  // 4. IP tespiti (fallback)
  try {
    const res = await axios.get('https://ipapi.co/json/', { timeout: 4000 });
    const code = res.data.country_code || 'TR'
    _cachedCountry = PRICING[code] ? code : 'TR'
    return _cachedCountry!
  } catch {
    _cachedCountry = 'TR'
    return _cachedCountry
  }
}

export function getPricing(country: string): PricingData {
  return PRICING[country] || PRICING.US;
}

export function formatPrice(price: number, symbol: string): string {
  return `${symbol}${price.toLocaleString()}`;
}
