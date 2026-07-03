import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { createContext, useContext, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth } from "@/hooks/useAuth";
import { AuthTokens, AuthUser } from "@/types";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ── Auth context ─────────────────────────────────────────────────────────────
interface AuthContextValue {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  tokens: null,
  isLoading: false,
  isInitializing: true,
  login: async () => {},
  logout: async () => {},
  updateUser: async () => {},
});

export const useAuthContext = () => useContext(AuthContext);

// ── Root navigator with auth-based redirect ─────────────────────────────────
function RootLayoutNav() {
  const { user, isLoading, isInitializing } = useContext(AuthContext);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isInitializing) return;
    if (isLoading) return;

    const currentGroup = segments[0] as string | undefined;
    const inAuthGroup = currentGroup === "(auth)";
    const inPublicGroup = currentGroup === "(public)";

    if (!user) {
      if (!inAuthGroup && !inPublicGroup) {
        router.replace("/(auth)/login");
      }
    } else {
      const role = user.role;
      const roleGroupMap: Record<string, string> = {
        super_admin: "(superadmin)",
        state_admin: "(stateadmin)",
        trip_admin:  "(tripadmin)",
        stakeholder: "(stakeholder)",
      };
      const roleGroup = roleGroupMap[role] ?? "(stakeholder)";

      const inProfileGroup = currentGroup === "(profile)";
      if (currentGroup !== roleGroup && !inPublicGroup && !inProfileGroup) {
        if (role === "super_admin")      router.replace("/(superadmin)");
        else if (role === "state_admin") router.replace("/(stateadmin)");
        else if (role === "trip_admin")  router.replace("/(tripadmin)");
        else                             router.replace("/(stakeholder)");
      }
    }
  }, [user, isLoading, isInitializing, segments]);

  if (isInitializing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(auth)"         options={{ headerShown: false }} />
      <Stack.Screen name="(superadmin)"  options={{ headerShown: false }} />
      <Stack.Screen name="(stateadmin)"  options={{ headerShown: false }} />
      <Stack.Screen name="(tripadmin)"   options={{ headerShown: false }} />
      <Stack.Screen name="(stakeholder)" options={{ headerShown: false }} />
      <Stack.Screen name="(profile)"    options={{ headerShown: false }} />
      <Stack.Screen name="(public)"     options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)"        options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

// ── Root layout ─────────────────────────────────────────────────────────────
export default function RootLayout() {
  const auth = useAuth();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthContext.Provider value={auth}>
                <StatusBar style="dark" backgroundColor="#f5f7fa" />
                <RootLayoutNav />
              </AuthContext.Provider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
