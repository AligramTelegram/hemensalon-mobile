import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { EventEmitter } from 'eventemitter3'

const emitter = new EventEmitter()

export interface Preferences {
  currency: string
  currencySymbol: string
  language: string
  timezone: string
}

const SYMBOL_MAP: Record<string, string> = {
  TRY: '₺', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ',
}

const defaults: Preferences = {
  currency: 'TRY',
  currencySymbol: '₺',
  language: 'tr',
  timezone: 'Europe/Istanbul',
}

let _cached: Preferences | null = null

async function load(): Promise<Preferences> {
  const [cur, lang, tz] = await Promise.all([
    AsyncStorage.getItem('pref_currency'),
    AsyncStorage.getItem('pref_language'),
    AsyncStorage.getItem('pref_timezone'),
  ])
  const currency = cur ?? defaults.currency
  _cached = {
    currency,
    currencySymbol: SYMBOL_MAP[currency] ?? currency,
    language: lang ?? defaults.language,
    timezone: tz ?? defaults.timezone,
  }
  return _cached
}

export async function savePreferences(prefs: Partial<Preferences & { currency: string }>) {
  const items: [string, string][] = []
  if (prefs.currency) items.push(['pref_currency', prefs.currency])
  if (prefs.language) items.push(['pref_language', prefs.language])
  if (prefs.timezone) items.push(['pref_timezone', prefs.timezone])
  await AsyncStorage.multiSet(items)
  _cached = null
  const next = await load()
  emitter.emit('change', next)
}

export function usePreferences(): Preferences {
  const [prefs, setPrefs] = useState<Preferences>(_cached ?? defaults)

  useEffect(() => {
    let mounted = true
    load().then(p => { if (mounted) setPrefs(p) })
    const handler = (p: Preferences) => { if (mounted) setPrefs(p) }
    emitter.on('change', handler)
    return () => { mounted = false; emitter.off('change', handler) }
  }, [])

  return prefs
}
