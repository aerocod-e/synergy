import { useState } from 'react';
import { AuthTokens, AuthUser } from '@/types';
import * as api from '@/services/api';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tokens, setTokensState] = useState<AuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const data = await api.login(email, password);
      api.setTokens(data.accessToken, data.refreshToken);
      setTokensState({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      setUser(data.user as AuthUser);
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
      setIsLoading(false);
    }
  };

  return { user, tokens, isLoading, login, logout };
}
