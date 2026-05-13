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
  TR: { country: 'TR', currency: 'TRY', symbol: '₺', starter: 540, professional: 1140, business: 1740 },
  US: { country: 'US', currency: 'USD', symbol: '$', starter: 29, professional: 59, business: 89 },
  DE: { country: 'DE', currency: 'EUR', symbol: '€', starter: 27, professional: 55, business: 82 },
  AE: { country: 'AE', currency: 'AED', symbol: 'د.إ', starter: 109, professional: 219, business: 329 },
  GB: { country: 'GB', currency: 'GBP', symbol: '£', starter: 23, professional: 47, business: 69 },
};

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  TRY: 'TR', USD: 'US', EUR: 'DE', AED: 'AE', GBP: 'GB',
};

const LANG_TO_COUNTRY: Record<string, string> = {
  tr: 'TR', de: 'DE', ar: 'AE', en: 'US',
};

let _cachedCountry: string | null = null

export async function detectCountry(): Promise<string> {
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

  // 3. IP tespiti (fallback)
  try {
    const res = await axios.get('https://ipapi.co/json/', { timeout: 4000 });
    _cachedCountry = res.data.country_code || 'TR'
    return _cachedCountry
  } catch {
    _cachedCountry = 'TR'
    return _cachedCountry
  }
}

export function getPricing(country: string): PricingData {
  return PRICING[country] || PRICING.TR;
}

export function formatPrice(price: number, symbol: string): string {
  return `${symbol}${price.toLocaleString()}`;
}
