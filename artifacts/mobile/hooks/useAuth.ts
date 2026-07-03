import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AuthTokens, AuthUser } from '@/types';
import * as api from '@/services/api';

const ACCESS_TOKEN_KEY = '@synergy/accessToken';
const REFRESH_TOKEN_KEY = '@synergy/refreshToken';
const USER_KEY = '@synergy/user';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tokens, setTokensState] = useState<AuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [accessToken, refreshToken, userJson] = await Promise.all([
          AsyncStorage.getItem(ACCESS_TOKEN_KEY),
          AsyncStorage.getItem(REFRESH_TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);

        if (accessToken && refreshToken && userJson) {
          api.setTokens(accessToken, refreshToken);
          setTokensState({ accessToken, refreshToken });
          const storedUser = JSON.parse(userJson) as AuthUser;
          setUser(storedUser);

          // Refresh from server so latest preferences (e.g. hideTripsTab) are picked up on load.
          try {
            const freshUser = (await api.getMe()) as Partial<AuthUser> & { userId?: string };
            const mergedUser: AuthUser = {
              ...storedUser,
              ...freshUser,
              id: storedUser.id,
            };
            setUser(mergedUser);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(mergedUser));
          } catch {
            // Non-fatal — keep using the cached user if the refresh fails.
          }
        }
      } catch {
      } finally {
        setIsInitializing(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const data = await api.login(email, password);
      api.setTokens(data.accessToken, data.refreshToken);
      setTokensState({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      setUser(data.user as AuthUser);

      await Promise.all([
        AsyncStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken),
        AsyncStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user)),
      ]);
      console.log("Tokens persisted to AsyncStorage");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (tokens?.refreshToken) {
        await api.logout(tokens.refreshToken).catch(() => {});
      }
    } finally {
      api.clearTokens();
      setUser(null);
      setTokensState(null);
      await Promise.all([
        AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
        AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
        AsyncStorage.removeItem(USER_KEY),
      ]).catch(() => {});
      setIsLoading(false);
    }
  };

  const updateUser = async (patch: Partial<AuthUser>): Promise<void> => {
    setUser((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, ...patch };
      AsyncStorage.setItem(USER_KEY, JSON.stringify(merged)).catch(() => {});
      return merged;
    });
  };

  return { user, tokens, isLoading, isInitializing, login, logout, updateUser };
}
