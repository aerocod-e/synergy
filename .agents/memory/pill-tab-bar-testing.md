---
name: PillTabBar testing quirks
description: Why Playwright text/accessibility lookups on the bottom tab bar (components/PillTabBar.tsx) can give false "tab not found" negatives.
---

`components/PillTabBar.tsx` only renders a text label on the currently-ACTIVE tab; inactive tabs show icon-only (no text), and no `tabBarAccessibilityLabel`/`accessibilityLabel` is set on any tab (the prop is passed through but never populated by callers). A Playwright step that searches for tab text like "Trips" while a different tab is active will get a false negative.

**How to apply:** when testing tab navigation, locate inactive tabs by position/icon (e.g. "the 2nd icon slot from the left") rather than by text, and only assert on the text label after that tab becomes active.

Also: the sole seeded `super_admin` account (superadmin@synergy.com) has `hideTripsTab = true`, so its Trips tab is correctly hidden by design (`app/(superadmin)/_layout.tsx` conditionally omits the `Tabs.Screen`) — don't treat a hidden Trips tab for that account as a bug.
