import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface LogoutButtonProps {
  onPress: () => void;
}

export default function LogoutButton({ onPress }: LogoutButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={{ padding: 8, marginRight: 8 }}>
      <Ionicons name="log-out-outline" size={24} color={theme.colors.primary} />
    </TouchableOpacity>
  );
}
