import { Tabs } from 'expo-router';
import { useLogout } from '@/hooks/useLogout';
import { theme } from '@/constants/theme';
import LogoutButton from '@/components/LogoutButton';

export default function StakeholderLayout() {
  const { handleLogout } = useLogout();

  return (
    <Tabs
      tabBar={() => null}
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
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
    </Tabs>
  );
}
