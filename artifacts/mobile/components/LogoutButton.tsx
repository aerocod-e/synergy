import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useAuthContext } from '@/app/_layout';
import { theme } from '@/constants/theme';

interface LogoutButtonProps {
  onPress: () => void;
}

export default function LogoutButton({ onPress }: LogoutButtonProps) {
  const { user } = useAuthContext();

  const initial = user?.firstName
    ? user.firstName[0].toUpperCase()
    : user?.email
    ? user.email[0].toUpperCase()
    : '?';

  return (
    <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.75}>
      <View style={styles.avatar}>
        <Text style={styles.initial}>{initial}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    marginRight: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
