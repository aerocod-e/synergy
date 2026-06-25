import { useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthContext } from '@/app/_layout';
import { theme } from '@/constants/theme';

export default function TopBar() {
  const { user, logout } = useAuthContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const initial = user?.firstName
    ? user.firstName[0].toUpperCase()
    : user?.email
    ? user.email[0].toUpperCase()
    : '?';

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/(auth)/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <View style={[styles.row, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => router.push('/(profile)')} activeOpacity={0.8}>
        <View style={styles.avatar}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleLogout}
        style={styles.logoutBtn}
        activeOpacity={0.8}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Ionicons name="log-out-outline" size={24} color={theme.colors.primary} />
        )}
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
    paddingBottom: 8,
    backgroundColor: theme.colors.background,
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
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
