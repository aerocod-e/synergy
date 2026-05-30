import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export default function SuperAdminDashboard() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Super Admin Dashboard</Text>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(superadmin)/create-trip')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={theme.colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16 },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.strong,
  },
});
