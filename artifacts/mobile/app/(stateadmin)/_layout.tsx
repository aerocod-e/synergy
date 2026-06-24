import { Tabs } from 'expo-router';
import { useLogout } from '@/hooks/useLogout';
import { theme } from '@/constants/theme';
import PillTabBar from '@/components/PillTabBar';
import LogoutButton from '@/components/LogoutButton';

export default function StateAdminLayout() {
  const { handleLogout } = useLogout();

  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{
        headerTitle: 'Synergy Cargo Tax',
        headerRight: () => <LogoutButton onPress={handleLogout} />,
        headerStyle: {
          backgroundColor: theme.colors.white,
          ...theme.shadows.header,
        },
        headerTitleStyle: { ...theme.typography.headerTitle },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Requests', tabBarLabel: 'Requests' }}
      />
      <Tabs.Screen
        name="trip-admins"
        options={{ title: 'Trip Admins', tabBarLabel: 'Trip Admins' }}
      />
    </Tabs>
  );
}
