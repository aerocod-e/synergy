import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { useLogout } from '@/hooks/useLogout';
import PillTabBar from '@/components/PillTabBar';
import { theme } from '@/constants/theme';
import LogoutButton from '@/components/LogoutButton';

export default function SuperAdminLayout() {
  const { handleLogout } = useLogout();
  const router = useRouter();

  const sharedHeaderOptions = {
    headerTitle: 'Synergy Cargo Tax',
    headerRight: () => <LogoutButton onPress={handleLogout} />,
    headerStyle: {
      backgroundColor: theme.colors.white,
      ...theme.shadows.header,
    },
    headerTitleStyle: { ...theme.typography.headerTitle },
    headerShadowVisible: false,
  };

  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{
        ...sharedHeaderOptions,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
        }}
      />
      <Tabs.Screen
        name="config"
        options={{
          title: 'Config',
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Users',
        }}
      />
      <Tabs.Screen
        name="trip-detail"
        options={{
          title: 'Trip Detail',
          href: null,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 16 }}>
              <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
    </Tabs>
  );
}
