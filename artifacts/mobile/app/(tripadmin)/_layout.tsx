import { Tabs } from 'expo-router';
import PillTabBar from '@/components/PillTabBar';

export default function TripAdminLayout() {
  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Tabs.Screen name="index"       options={{ title: 'Trips',    tabBarLabel: 'Trips' }} />
      <Tabs.Screen name="vehicles"    options={{ title: 'Vehicles', tabBarLabel: 'Vehicles' }} />
      <Tabs.Screen name="drivers"     options={{ title: 'Drivers',  tabBarLabel: 'Drivers' }} />
      <Tabs.Screen name="trip-detail" options={{ title: 'Trip Detail', href: null }} />
    </Tabs>
  );
}
