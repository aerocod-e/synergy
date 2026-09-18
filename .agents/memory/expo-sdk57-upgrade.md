---
name: Expo SDK 57 upgrade notes
description: Non-obvious breakages hit when upgrading this mobile app to Expo SDK 57 / RN 0.86 / TS 6.
---

- `npx expo install --fix` bumps mobile `typescript` to ~6.0; TS 6 errors on `baseUrl` in tsconfig (removed; `paths` already relative). Root still uses TS 5.9.
- SDK 57 app.json schema rejects top-level `splash` and `ios.statusBarStyle`; splash config lives in the `expo-splash-screen` plugin.
- `expo-status-bar` dropped `backgroundColor` (edge-to-edge); RN 0.86 types dropped `StyleSheet.absoluteFillObject` (use `absoluteFill`).
- Expo Router 57 warns "Layout children must be of type Screen" for conditional `{cond && <Tabs.Screen/>}`; use `href: null` instead.
- `pnpm build` for mobile uses a hard-coded Metro port 8081, which collides with the mockup-sandbox dev server locally; stop the sandbox to run the export locally (deployment is unaffected).
- React catalog pin must be the exact React version SDK 57 expects (19.2.3); it is shared with mockup-sandbox.
- The "React Native DevTools ... libglib-2.0.so.0" error on `expo start` is harmless in this container.

## Expo Go crashes after bundling (simulators)
Expo Go builds older than iOS 57.0.6 / Android 57.0.3 crash (native SIGSEGV on the JS thread) right after an SDK 57 bundle finishes loading — no JS error, Metro shows a successful "iOS/Android Bundled" line and then nothing (expo/expo#48390). Not a project bug; expo-doctor and `expo install --check` pass. Ask which Expo Go build the simulator/phone runs before touching code. Also known to crash on SDK 57: reanimated `Keyframe` and `@expo/ui` components (#48378) — this project uses neither.
