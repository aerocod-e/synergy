import { Tabs } from 'expo-router';
import PillTabBar from '@/components/PillTabBar';

export default function StateAdminLayout() {
  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"        options={{ title: 'Requests',    tabBarLabel: 'Requests' }} />
      <Tabs.Screen name="trip-admins"  options={{ title: 'Trip Admins', tabBarLabel: 'Trip Admins' }} />
      <Tabs.Screen name="wallet"       options={{ title: 'Wallet',      tabBarLabel: 'Wallet' }} />
      <Tabs.Screen name="ledger-detail" options={{ href: null }} />
    </Tabs>
  );
}
