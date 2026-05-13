import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useColorScheme } from 'react-native'

export type ThemeColors = {
  bg: string
  card: string
  cardBorder: string
  text: string
  textSub: string
  textMuted: string
  input: string
  inputBorder: string
  separator: string
  hero: string
  heroText: string
}

export const LIGHT: ThemeColors = {
  bg: '#F4F4F8',
  card: '#ffffff',
  cardBorder: '#F3F4F6',
  text: '#111827',
  textSub: '#374151',
  textMuted: '#9CA3AF',
  input: '#ffffff',
  inputBorder: '#E5E7EB',
  separator: '#F3F4F6',
  hero: '#7C3AED',
  heroText: '#ffffff',
}

export const DARK: ThemeColors = {
  bg: '#0F0F14',
  card: '#1A1A24',
  cardBorder: '#2D2D3A',
  text: '#F9FAFB',
  textSub: '#D1D5DB',
  textMuted: '#6B7280',
  input: '#1A1A24',
  inputBorder: '#2D2D3A',
  separator: '#2D2D3A',
  hero: '#5B21B6',
  heroText: '#ffffff',
}

type ThemeContextType = {
  isDark: boolean
  colors: ThemeColors
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: LIGHT,
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme()
  const [isDark, setIsDark] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem('dark_mode').then(v => {
      if (v !== null) setIsDark(v === '1')
      else setIsDark(systemScheme === 'dark')
      setLoaded(true)
    })
  }, [])

  async function toggle() {
    const next = !isDark
    setIsDark(next)
    await AsyncStorage.setItem('dark_mode', next ? '1' : '0')
  }

  if (!loaded) return null

  return (
    <ThemeContext.Provider value={{ isDark, colors: isDark ? DARK : LIGHT, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
