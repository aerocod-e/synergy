import { Tabs } from 'expo-router';

export default function StakeholderLayout() {
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"         options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="ledger-detail" options={{ href: null }} />
    </Tabs>
  );
}
