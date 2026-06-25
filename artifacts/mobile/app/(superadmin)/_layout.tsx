import { Tabs } from 'expo-router';
import PillTabBar from '@/components/PillTabBar';

export default function SuperAdminLayout() {
  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Tabs.Screen name="index"       options={{ title: 'Home' }} />
      <Tabs.Screen name="trips"       options={{ title: 'Trips' }} />
      <Tabs.Screen name="config"      options={{ title: 'Config' }} />
      <Tabs.Screen name="users"       options={{ title: 'Users' }} />
      <Tabs.Screen name="trip-detail" options={{ title: 'Trip Detail',  href: null }} />
      <Tabs.Screen name="user-detail" options={{ title: 'User Detail',  href: null }} />
    </Tabs>
  );
}
