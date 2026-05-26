import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IoniconsName; inactive: IoniconsName }> = {
  index: { active: 'list', inactive: 'list' },
  config: { active: 'settings', inactive: 'settings-outline' },
  users: { active: 'people', inactive: 'people-outline' },
  ledger: { active: 'receipt', inactive: 'receipt-outline' },
};

const PILL_PADDING = 6;
const SLIDER_VERTICAL_INSET = 6;

export default function PillTabBar(props: any) {
  const { state, descriptors, navigation } = props as {
    state: { index: number; routes: Array<{ key: string; name: string }> };
    descriptors: Record<string, { options: { tabBarLabel?: any; title?: string; tabBarAccessibilityLabel?: string } }>;
    navigation: { emit: (e: any) => any; navigate: (name: string) => void };
  };

  const insets = useSafeAreaInsets();
  const tabCount = state.routes.length;

  const [pillWidth, setPillWidth] = useState(0);
  const sliderAnim = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(sliderAnim, {
      toValue: state.index,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [state.index, sliderAnim]);

  const slotWidth = pillWidth > 0 ? (pillWidth - PILL_PADDING * 2) / tabCount : 0;

  const sliderTranslateX = sliderAnim.interpolate({
    inputRange: state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => PILL_PADDING + i * slotWidth),
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View
        style={styles.pill}
        onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
      >
        {pillWidth > 0 && (
          <Animated.View
            style={[
              styles.slider,
              {
                width: slotWidth,
                transform: [{ translateX: sliderTranslateX }],
              },
            ]}
          />
        )}

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title ?? route.name;
          const isFocused = state.index === index;

          const iconSet = TAB_ICONS[route.name] ?? {
            active: 'ellipse' as IoniconsName,
            inactive: 'ellipse-outline' as IoniconsName,
          };
          const iconName: IoniconsName = isFocused ? iconSet.active : iconSet.inactive;

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
              style={styles.tabItem}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
            >
              <Ionicons
                name={iconName}
                size={20}
                color={isFocused ? theme.colors.white : theme.colors.grey1}
              />
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {label}
              </Text>
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
    bottom: 24,
    left: 20,
    right: 20,
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    borderRadius: 32,
    height: 64,
    alignItems: 'center',
    paddingHorizontal: PILL_PADDING,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  slider: {
    position: 'absolute',
    top: SLIDER_VERTICAL_INSET,
    bottom: SLIDER_VERTICAL_INSET,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey1,
  },
  tabLabelActive: {
    color: theme.colors.white,
  },
});
