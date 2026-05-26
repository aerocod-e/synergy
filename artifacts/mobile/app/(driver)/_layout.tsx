import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { useLogout } from '@/hooks/useLogout';

export default function DriverLayout() {
  const { handleLogout } = useLogout();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerTitle: 'My Trip',
          headerRight: () => (
            <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
              <Ionicons name="log-out-outline" size={24} color="#1a6ec8" />
            </TouchableOpacity>
          ),
          headerStyle: { backgroundColor: '#ffffff' },
          headerTitleStyle: { color: '#000000', fontWeight: '600' },
        }}
      />
    </Stack>
  );
}
