import { Tabs } from 'expo-router';
import PillTabBar from '@/components/PillTabBar';

export default function StateAdminLayout() {
  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Tabs.Screen name="index"       options={{ title: 'Requests',   tabBarLabel: 'Requests' }} />
      <Tabs.Screen name="trip-admins" options={{ title: 'Trip Admins', tabBarLabel: 'Trip Admins' }} />
    </Tabs>
  );
}
