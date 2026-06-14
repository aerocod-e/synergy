---
name: Expo web FAB pattern
description: Floating FABs (position:absolute inside tab screen) are unreliable on Expo web — use navigation.setOptions headerRight instead.
---

# Expo web FAB pattern

## Rule
Do NOT use `position: 'absolute'` floating FABs inside tab screen content on Expo web. The React Navigation tab-bar container renders above screen content in the DOM stacking context, intercepting touches intended for the FAB even when the visual positions don't overlap. `pointerEvents: 'box-none'` on the tab bar wrapper does not reliably fix this on web.

**Why:** React Navigation renders the custom `tabBar` component in a container that sits on top of the screen content in the DOM. On web, CSS touch interception by this container cannot be reliably disabled via React Native's `pointerEvents` prop, because `box-none` does not map cleanly to standard CSS `pointer-events` in all cases.

**How to apply:** For screens inside a `<Tabs>` navigator that need a primary action button:
1. Import `useNavigation` from `expo-router`
2. Call `navigation.setOptions({ headerRight: () => <TouchableOpacity ...> })` inside a `useEffect`
3. Include both the action button AND the logout icon in `headerRight` (so logout is not lost)
4. The modal state stays in the screen component — `headerRight` callback just calls `setModalVisible(true)`

This pattern works because header buttons render in React Navigation's header layer, which is always interactive.

Example pattern (vehicles.tsx):
```tsx
useEffect(() => {
  navigation.setOptions({
    headerRight: () => (
      <View style={styles.headerRight}>
        <TouchableOpacity onPress={openModal} accessibilityLabel="Register vehicle">
          <Ionicons name="add-circle-outline" size={26} color={theme.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
    ),
  });
}, [navigation, openModal, handleLogout]);
```
