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

// ── Role → home route mapping ────────────────────────────────────────────────
// Six top-level groups — (profile), (stakeholder), (stateadmin), (superadmin),
// (tripadmin), (tabs) — each have their own index screen, and Expo Router
// strips group-name parentheses when generating routes, so all six resolve to
// the exact same bare path "/". On a cold start or full reload, the router
// can't tell these apart and deterministically resolves "/" to whichever
// candidate wins its own internal ordering (observed: "(profile)"), regardless
// of the logged-in user's role. See the first-resolution handling below for
// how this is neutralized without relying on which group happens to win.
type RoleHomeGroup = "(superadmin)" | "(stateadmin)" | "(tripadmin)" | "(stakeholder)";
type RoleHomePath = "/(superadmin)" | "/(stateadmin)" | "/(tripadmin)" | "/(stakeholder)";

const ROLE_GROUP_MAP: Record<string, RoleHomeGroup> = {
  super_admin: "(superadmin)",
  state_admin: "(stateadmin)",
  trip_admin:  "(tripadmin)",
  stakeholder: "(stakeholder)",
};

export function getRoleGroup(role: string | undefined): RoleHomeGroup {
  return ROLE_GROUP_MAP[role ?? ""] ?? "(stakeholder)";
}

export function getRoleHomePath(role: string | undefined): RoleHomePath {
  switch (getRoleGroup(role)) {
    case "(superadmin)": return "/(superadmin)";
    case "(stateadmin)": return "/(stateadmin)";
    case "(tripadmin)":  return "/(tripadmin)";
    default:             return "/(stakeholder)";
  }
}

// ── Root navigator with auth-based redirect ─────────────────────────────────
function RootLayoutNav() {
  const { user, isLoading, isInitializing } = useContext(AuthContext);
  const segments = useSegments();
  const router = useRouter();
  // Tracks whether we've handled the very first route resolution after this
  // app instance mounted (cold start / full reload). That first resolution is
  // the one subject to the "/" ambiguity described above, so it must always be
  // forced to the user's correct role group. Once settled, normal in-app
  // navigation (e.g. tapping the avatar to visit the profile screen) is left
  // alone.
  const hasSettledInitialRouteRef = React.useRef(false);

  useEffect(() => {
    if (isInitializing) return;
    if (isLoading) return;

    const currentGroup = segments[0] as string | undefined;
    const inAuthGroup = currentGroup === "(auth)";
    const inPublicGroup = currentGroup === "(public)";
    const isFirstResolution = !hasSettledInitialRouteRef.current;
    hasSettledInitialRouteRef.current = true;

    if (!user) {
      if (!inAuthGroup && !inPublicGroup) {
        router.replace("/(auth)/login");
      }
      return;
    }

    const roleGroup = getRoleGroup(user.role);
    const inProfileGroup = currentGroup === "(profile)";

    if (isFirstResolution) {
      // Never trust the ambiguous "/" resolution on a fresh session — always
      // land on the correct role group, even if the router resolved to
      // "(profile)" (or any other unrelated group) instead. "(public)" is
      // still allowed here since it's a legitimate deep-link destination.
      if (currentGroup !== roleGroup && !inPublicGroup) {
        router.replace(getRoleHomePath(user.role));
      }
      return;
    }

    // For subsequent in-app navigation, "(profile)" is a valid destination
    // for any role (e.g. the avatar button), so only correct real mismatches.
    if (currentGroup !== roleGroup && !inPublicGroup && !inProfileGroup) {
      router.replace(getRoleHomePath(user.role));
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
