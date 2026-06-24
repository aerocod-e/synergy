import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthContext } from '@/app/_layout';
import { theme } from '@/constants/theme';

export default function TopBar() {
  const { user, logout } = useAuthContext();
  const router = useRouter();

  const initial = user?.firstName
    ? user.firstName[0].toUpperCase()
    : user?.email
    ? user.email[0].toUpperCase()
    : '?';

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => router.push('/(profile)')} activeOpacity={0.8}>
        <View style={styles.avatar}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={24} color={theme.colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  logoutBtn: {
    padding: 8,
  },
});
