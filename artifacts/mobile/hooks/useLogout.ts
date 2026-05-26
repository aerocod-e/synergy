import { useRouter } from 'expo-router';
import { useAuthContext } from '@/app/_layout';

export function useLogout() {
  const { logout } = useAuthContext();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return { handleLogout };
}
