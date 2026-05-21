import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Floating dock'un kapladığı yükseklik — ekranların contentContainerStyle paddingBottom'una ekle */
export function useDockPad() {
  const insets = useSafeAreaInsets()
  const safeBottom = insets.bottom  // hem iOS hem Android safe area
  return 68 + 36 + safeBottom  // dock yüksekliği + bottom offset + safe area
}
