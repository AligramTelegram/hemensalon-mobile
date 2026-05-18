import { Tabs } from 'expo-router'

const TAB_NAMES = ['index', 'appointments', 'customers', 'menu']

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      {TAB_NAMES.map(name => (
        <Tabs.Screen key={name} name={name} />
      ))}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  )
}
