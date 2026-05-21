import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native'

interface Props {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: ViewStyle
}

export function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style }: Props) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        { width: width as number, height, borderRadius, backgroundColor: '#E5E7EB' },
        { opacity },
        style,
      ]}
    />
  )
}

// Hazır skeleton layout bileşenleri — her ekran bunları kullanır

export function SkeletonCard() {
  return (
    <View style={sk.card}>
      <SkeletonBox height={14} width="60%" />
      <View style={{ height: 8 }} />
      <SkeletonBox height={12} width="40%" />
    </View>
  )
}

export function SkeletonListRow() {
  return (
    <View style={sk.row}>
      <SkeletonBox width={44} height={44} borderRadius={22} />
      <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
        <SkeletonBox height={14} width="70%" />
        <SkeletonBox height={12} width="45%" />
      </View>
    </View>
  )
}

export function SkeletonStatRow() {
  return (
    <View style={sk.statRow}>
      {[1, 2].map(i => (
        <View key={i} style={sk.statCard}>
          <SkeletonBox height={12} width="50%" />
          <View style={{ height: 6 }} />
          <SkeletonBox height={22} width="70%" />
        </View>
      ))}
    </View>
  )
}

export function SkeletonScreen({ rows = 5 }: { rows?: number }) {
  return (
    <View style={sk.screen}>
      <SkeletonStatRow />
      <View style={{ height: 16 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i}>
          <SkeletonListRow />
          {i < rows - 1 && <View style={{ height: 12 }} />}
        </View>
      ))}
    </View>
  )
}

const sk = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  screen: {
    flex: 1,
    padding: 16,
  },
})
