---
name: Alert.alert is a no-op on Expo web
description: react-native-web's Alert.alert() does nothing on web builds; confirmation dialogs must branch by Platform.OS.
---

`Alert.alert(...)` from `react-native` compiles to react-native-web's `Alert` class on web targets, whose `alert()` method is an empty no-op (verified in `react-native-web/dist/exports/Alert/index.js`). Any code calling `Alert.alert()` for confirmations (destructive delete/deactivate flows, error messages) silently does nothing on web — no dialog, no callback fires, nothing happens visually.

This affects every existing `Alert.alert` confirmation flow in this codebase (e.g. delete vehicle, delete trip admin, toggle-active flows) — they only work on native iOS/Android, not on Expo web.

**Why:** Discovered while building vehicle-type deactivate confirmation — e2e testing (Playwright against Expo web) showed no dialog ever appeared and the action silently failed, despite the code matching the exact pattern used elsewhere in the app for destructive confirms.

**How to apply:** When a confirmation dialog must work on Expo web (e.g. anything covered by e2e/Playwright testing), branch on `Platform.OS === 'web'` and use `window.confirm(message)` / `window.alert(message)` instead of `Alert.alert(...)`, falling back to `Alert.alert` for native. Note `window.confirm` blocks synchronously and returns a boolean, unlike Alert.alert's callback-based API, so the calling code structure differs slightly (no separate Cancel/Confirm button config needed).
