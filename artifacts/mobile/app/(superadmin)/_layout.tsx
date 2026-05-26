import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { useLogout } from '@/hooks/useLogout';

const ACTIVE_COLOR = '#1a6ec8';
const INACTIVE_COLOR = '#888888';

export default function SuperAdminLayout() {
  const { handleLogout } = useLogout();

  const logoutButton = (
    <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
      <Ionicons name="log-out-outline" size={24} color={ACTIVE_COLOR} />
    </TouchableOpacity>
  );

  const sharedHeaderOptions = {
    headerTitle: 'Synergy Cargo Tax',
    headerRight: () => logoutButton,
    headerStyle: { backgroundColor: '#ffffff' },
    headerTitleStyle: { color: '#000000', fontWeight: '600' as const },
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: { backgroundColor: '#ffffff' },
        ...sharedHeaderOptions,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallets"
        options={{
          title: 'Wallets',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
