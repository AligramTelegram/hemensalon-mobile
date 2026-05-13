import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Platform } from 'react-native'

export function useHeaderPad() {
  const insets = useSafeAreaInsets()
  return Platform.OS === 'ios' ? insets.top + 12 : 20
}
