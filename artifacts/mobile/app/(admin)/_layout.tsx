import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { useLogout } from '@/hooks/useLogout';
import PillTabBar from '@/components/PillTabBar';
import { theme } from '@/constants/theme';

export default function AdminLayout() {
  const { handleLogout } = useLogout();

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
          title: 'My Wallet',
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: 'Ledger',
        }}
      />
    </Tabs>
  );
}
