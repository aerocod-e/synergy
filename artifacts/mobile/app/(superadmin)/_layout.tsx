import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { useLogout } from '@/hooks/useLogout';
import PillTabBar from '@/components/PillTabBar';
import { theme } from '@/constants/theme';

export default function SuperAdminLayout() {
  const { handleLogout } = useLogout();
  const router = useRouter();

  const logoutButton = (
    <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
      <Ionicons name="log-out-outline" size={24} color={theme.colors.primary} />
    </TouchableOpacity>
  );

  const sharedHeaderOptions = {
    headerTitle: 'Synergy Cargo Tax',
    headerRight: () => logoutButton,
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
        name="create-trip"
        options={{
          title: 'Create Trip',
          href: null,
          headerRight: () => null,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 16 }}>
              <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          ),
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
