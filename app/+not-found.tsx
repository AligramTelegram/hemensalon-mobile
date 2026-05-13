import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <View style={s.container}>
      <Text style={s.title}>{t('not_found_title')}</Text>
      <Link href="/" style={s.link}>{t('not_found_back')}</Link>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF8FF' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 16 },
  link: { color: '#7C3AED', fontSize: 16 },
});
