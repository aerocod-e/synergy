import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { useLogout } from '@/hooks/useLogout';
import { theme } from '@/constants/theme';
import PillTabBar from '@/components/PillTabBar';

export default function TripAdminLayout() {
  const { handleLogout } = useLogout();

  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{
        headerTitle: 'Synergy Cargo Tax',
        headerRight: () => (
          <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        ),
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
        options={{ title: 'Trips', tabBarLabel: 'Trips' }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{ title: 'Vehicles', tabBarLabel: 'Vehicles' }}
      />
      <Tabs.Screen
        name="drivers"
        options={{ title: 'Drivers', tabBarLabel: 'Drivers' }}
      />
    </Tabs>
  );
}
