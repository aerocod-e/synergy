---
name: Expo Android icon rendering
description: Why this app uses lucide-react-native instead of font-based vector icons, and the component-prop pattern it requires.
---

# Expo Android icon rendering

The mobile app renders all icons with `lucide-react-native` (SVG-based, backed by `react-native-svg`). Do NOT reintroduce `@react-native-vector-icons/*` or `@expo/vector-icons` font glyphs for UI icons.

**Why:** Font-based vector icons (Ionicons/Feather via `@react-native-vector-icons`) failed to render reliably on Android in this Expo setup — glyphs showed as boxes/blanks despite `useFonts` + `setDynamicLoadingEnabled(false)`. SVG icons have zero font-loading dependency, so they render deterministically on every platform.

**How to apply:**
- Import named components: `import { Search, Eye } from 'lucide-react-native'` and render `<Search size={n} color={c} />`. There are no filled/outline name variants — pick one component per concept and differentiate state with color.
- Pin `react-native-svg` to the Expo-recommended version (`expo install react-native-svg`); a mismatched version triggers Expo's compatibility warning and can break native rendering.
- For a dynamic/icon-as-data prop, type it `ComponentType<{ size?: number; color?: string; style?: any }>` and pass the Lucide component itself (e.g. `icon={ShieldCheck}`), then render `<Icon .../>`. See `app/(superadmin)/index.tsx` (SummaryCard) and `components/PillTabBar.tsx` (TAB_ICONS) for the established pattern.
- Conditional icons become component branches: `{cond ? <Eye .../> : <EyeOff .../>}`, not a ternary on a `name` string.
