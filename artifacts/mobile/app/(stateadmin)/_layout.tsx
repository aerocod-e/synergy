import { useEffect } from 'react';
import { Tabs, useRouter, useSegments } from 'expo-router';
import PillTabBar from '@/components/PillTabBar';

export const unstable_settings = {
  initialRouteName: 'wallet',
};

export default function StateAdminLayout() {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const currentRoute = segments[segments.length - 1];
    if (currentRoute !== 'wallet') {
      router.replace('/(stateadmin)/wallet');
    }
  }, []);

  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="wallet"       options={{ title: 'Wallet',      tabBarLabel: 'Wallet' }} />
      <Tabs.Screen name="index"        options={{ title: 'Requests',    tabBarLabel: 'Requests' }} />
      <Tabs.Screen name="trip-admins"  options={{ title: 'Trip Admins', tabBarLabel: 'Trip Admins' }} />
      <Tabs.Screen name="ledger-detail" options={{ href: null }} />
    </Tabs>
  );
}
