import { BlurView } from 'expo-blur';
import { Car, Circle, List, Receipt, Settings, User, Users, Wallet } from 'lucide-react-native';
import { ComponentType, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

type IconComponent = ComponentType<{ size?: number; color?: string }>;

const TAB_ICONS: Record<string, IconComponent> = {
  index: List,
  config: Settings,
  users: Users,
  ledger: Receipt,
  vehicles: Car,
  'trip-admins': User,
  wallet: Wallet,
};

const PILL_PADDING = 6;
const SLIDER_VERTICAL_INSET = 6;

const HIDDEN_ROUTES = new Set(['create-trip', 'trip-detail', 'user-detail', 'ledger-detail']);

export default function PillTabBar(props: any) {
  const { state, descriptors, navigation } = props as {
    state: { index: number; routes: Array<{ key: string; name: string }> };
    descriptors: Record<string, { options: { tabBarLabel?: any; title?: string; tabBarAccessibilityLabel?: string } }>;
    navigation: { emit: (e: any) => any; navigate: (name: string) => void };
  };

  const insets = useSafeAreaInsets();
  const [pillWidth, setPillWidth] = useState(0);

  const visibleRoutes = state.routes.filter((r) => !HIDDEN_ROUTES.has(r.name));
  const tabCount = visibleRoutes.length;

  const focusedVisibleIndex = visibleRoutes.findIndex(
    (r) => r.key === state.routes[state.index]?.key,
  );

  const sliderAnim = useRef(new Animated.Value(Math.max(focusedVisibleIndex, 0))).current;

  useEffect(() => {
    if (focusedVisibleIndex < 0) return;
    Animated.spring(sliderAnim, {
      toValue: focusedVisibleIndex,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [focusedVisibleIndex, sliderAnim]);

  const currentRouteName = state.routes[state.index]?.name;
  if (HIDDEN_ROUTES.has(currentRouteName)) return null;

  const slotWidth = pillWidth > 0 ? (pillWidth - PILL_PADDING * 2) / tabCount : 0;

  const sliderTranslateX = sliderAnim.interpolate({
    inputRange: visibleRoutes.map((_, i) => i),
    outputRange: visibleRoutes.map((_, i) => PILL_PADDING + i * slotWidth),
    extrapolate: 'clamp',
  });

  const pillBottom = Math.max(insets.bottom, 8);

  return (
    <View style={[styles.wrapper, { bottom: pillBottom, pointerEvents: 'box-none' }]}>
      <View
        style={[styles.pill, Platform.OS !== 'ios' && styles.pillAndroid]}
        onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
      >
        {Platform.OS === 'ios' && (
          <BlurView
            intensity={60}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}

        {pillWidth > 0 && (
          <Animated.View
            style={[
              styles.slider,
              {
                pointerEvents: 'none',
                width: slotWidth,
                transform: [{ translateX: sliderTranslateX }],
              },
            ]}
          />
        )}

        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title ?? route.name;
          const isFocused = state.routes[state.index]?.key === route.key;

          const IconComponent = TAB_ICONS[route.name] ?? Circle;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[styles.tabItem, isFocused && styles.tabItemActive]}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
            >
              <IconComponent
                size={20}
                color={isFocused ? theme.colors.white : theme.colors.grey1}
              />
              {isFocused && (
                <Text style={styles.tabLabelActive}>{label}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  pill: {
    flexDirection: 'row',
    borderRadius: 32,
    height: 64,
    alignItems: 'center',
    paddingHorizontal: PILL_PADDING,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 14,
  },
  pillAndroid: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(200,200,200,0.5)',
  },
  slider: {
    position: 'absolute',
    top: SLIDER_VERTICAL_INSET,
    bottom: SLIDER_VERTICAL_INSET,
    borderRadius: 26,
    backgroundColor: 'rgba(26, 110, 200, 0.85)',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabItemActive: {
    gap: 6,
  },
  tabLabelActive: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.white,
  },
});
