import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, Image, Dimensions, Easing, Text } from 'react-native'

const { width, height } = Dimensions.get('window')

interface Props {
  onFinish: () => void
}

export function SplashAnimation({ onFinish }: Props) {
  const bgOpacity    = useRef(new Animated.Value(1)).current
  const logoScale    = useRef(new Animated.Value(0.4)).current
  const logoOpacity  = useRef(new Animated.Value(0)).current
  const ring1Scale   = useRef(new Animated.Value(0.4)).current
  const ring1Opacity = useRef(new Animated.Value(0)).current
  const ring2Scale   = useRef(new Animated.Value(0.4)).current
  const ring2Opacity = useRef(new Animated.Value(0)).current
  const exitScale    = useRef(new Animated.Value(1)).current
  const textOpacity  = useRef(new Animated.Value(0)).current
  const textY        = useRef(new Animated.Value(12)).current

  useEffect(() => {
    Animated.sequence([
      // 1. Logo fırla
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 160,
          friction: 8,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),

      // 2. Yazı gelsin
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(textY, { toValue: 0, useNativeDriver: true, tension: 160, friction: 10 }),
      ]),

      // 3. Halkalar yayıl
      Animated.parallel([
        Animated.timing(ring1Scale,   { toValue: 1.8, duration: 500, easing: Easing.out(Easing.exp), useNativeDriver: true }),
        Animated.timing(ring1Opacity, { toValue: 0,   duration: 500, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(120),
          Animated.parallel([
            Animated.timing(ring2Scale,   { toValue: 2.4, duration: 500, easing: Easing.out(Easing.exp), useNativeDriver: true }),
            Animated.timing(ring2Opacity, { toValue: 0,   duration: 500, useNativeDriver: true }),
          ]),
        ]),
      ]),

      // 3. Kısa bekle
      Animated.delay(200),

      // 5. Logo büyüyerek çık + arka plan solar
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(exitScale, {
          toValue: 18,
          duration: 500,
          easing: Easing.in(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(bgOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => onFinish())

    // Halkaları başlat (ring1 baştan %40 opacity ile)
    ring1Opacity.setValue(0.35)
    ring2Opacity.setValue(0.2)
  }, [])

  return (
    <Animated.View style={[s.root, { opacity: bgOpacity }]}>

      {/* Halka 1 */}
      <Animated.View style={[s.ring, s.ring1, {
        transform: [{ scale: ring1Scale }],
        opacity: ring1Opacity,
      }]} />

      {/* Halka 2 */}
      <Animated.View style={[s.ring, s.ring2, {
        transform: [{ scale: ring2Scale }],
        opacity: ring2Opacity,
      }]} />

      {/* Logo + Yazı */}
      <Animated.View style={[s.logoWrap, {
        transform: [{ scale: Animated.multiply(logoScale, exitScale) }],
        opacity: logoOpacity,
      }]}>
        <Image
          source={require('@/assets/icon.png')}
          style={s.logo}
          resizeMode="contain"
        />
      </Animated.View>

      <Animated.View style={[s.textWrap, {
        opacity: textOpacity,
        transform: [{ translateY: textY }],
      }]}>
        <Text style={s.textMain}>Hemen<Text style={s.textBold}>Salon</Text></Text>
      </Animated.View>

    </Animated.View>
  )
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
  },
  ring1: {
    width: 180,
    height: 180,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  ring2: {
    width: 180,
    height: 180,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  logoWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  textWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  textMain: {
    fontSize: 32,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: -0.5,
  },
  textBold: {
    fontWeight: '800',
    color: '#fff',
  },
})
