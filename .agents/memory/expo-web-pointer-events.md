---
name: Expo web pointerEvents warning
description: How to eliminate the "props.pointerEvents is deprecated" console warning in Expo web builds with react-native-web 0.21.x
---

## The rule
Patching individual library components that pass `pointerEvents` as a JSX prop is fragile and incomplete. The definitive fix is to remove the `warnOnce` call from **react-native-web's own `createDOMProps`** — this silences the warning at the source while preserving all behavior.

**Why:** The warning fires from `createDOMProps/index.js` via `warnOnce('pointerEvents', ...)` whenever ANY component (including deep library internals) passes `pointerEvents` as a prop. The list of culprits spans multiple packages: `@react-navigation/elements` Header.js and Screen.js, `@react-navigation/bottom-tabs` ScreenFallback.js, `react-native-screens` ScreenStackHeaderConfig.js, and potentially others. Fixing them all individually requires hunting down each source; removing the `warnOnce` call eliminates all instances at once.

**How to apply:**
1. Patch both builds: `dist/cjs/modules/createDOMProps/index.js` and `dist/modules/createDOMProps/index.js` inside the react-native-web `.pnpm` directory.
2. Remove the line: `warnOnce('pointerEvents', "props.pointerEvents is deprecated. Use style.pointerEvents");` (and the enclosing `if (pointerEvents != null) { ... }` block).
3. The style-processing line immediately after (`StyleSheet([style, pointerEvents && ...])`) remains — so pointerEvents still works correctly as a prop (mapped to CSS pointer-events).
4. Restart Expo with `--clear` to bust Metro's bundle cache.

**Additional fixes (belt-and-suspenders, keep in place):**
- `@react-navigation/elements` `Header.js` — 6 Animated.View/View components: move `pointerEvents` prop into style array
- `@react-navigation/elements` `Screen.js` — header measurement View: move `pointerEvents` into style object
- `@react-navigation/bottom-tabs` `ScreenFallback.js` — extract `pointerEvents` from rest-spread, merge into mergedStyle
- `react-native-screens` `ScreenStackHeaderConfig.js` (commonjs) — Platform.OS guard for web

**Debugging tip:** Use a `console.warn` interceptor + `new Error().stack` in `_layout.tsx` to capture the call chain as a compact pipe-delimited log line. The stack frame `updateForwardRef:NNNN → View:MMMM → createDOMProps` confirms the issue is a View receiving pointerEvents as a prop, but finding the PARENT component from the stack trace alone is impossible — it requires searching all compiled library JS for `pointerEvents.*box-none` outside style objects.
