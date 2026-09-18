import { Tabs } from 'expo-router';
import PillTabBar from '@/components/PillTabBar';
import { useAuthContext } from '@/app/_layout';

export default function SuperAdminLayout() {
  const { user } = useAuthContext();
  const hideTripsTab = user?.hideTripsTab === true;

  return (
    <Tabs
      tabBar={(props) => (
        <PillTabBar {...props} extraHiddenRoutes={hideTripsTab ? ['trips'] : []} />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"       options={{ title: 'Home' }} />
      <Tabs.Screen name="trips"       options={{ title: 'Trips', ...(hideTripsTab ? { href: null } : {}) }} />
      <Tabs.Screen name="config"      options={{ title: 'Config' }} />
      <Tabs.Screen name="users"       options={{ title: 'Users' }} />
      <Tabs.Screen name="trip-detail" options={{ title: 'Trip Detail',  href: null }} />
      <Tabs.Screen name="user-detail" options={{ title: 'User Detail',  href: null }} />
    </Tabs>
  );
}
