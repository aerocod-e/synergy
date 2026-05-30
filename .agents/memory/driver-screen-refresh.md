---
name: Driver screen post-action refresh pattern
description: After startTrip/completeTrip, always use fetchTrips(true) for an inline RefreshControl update, not fetchTrips() which shows a full skeleton.
---

## The rule
In `artifacts/mobile/app/(driver)/index.tsx`, after any action that mutates trip state:
- **Use `fetchTrips(true)`** (isRefresh=true) — triggers RefreshControl spinner at the top of the FlatList while keeping all content mounted. The status badge and action button update inline when new data arrives.
- **Do NOT use `fetchTrips()`** (isRefresh=false) — sets `loading=true`, which returns `<SkeletonScreen />` immediately, unmounting the FlatList. Playwright cannot observe the badge change because the whole tree is replaced and then remounted.

**Why:** `fetchTrips()` without args shows skeleton, which unmounts the FlatList mid-test. The Playwright screenshot ends up catching either the skeleton phase or the remounted FlatList — both of which make it look like the UI didn't update.

**How to apply:**
- Any `handleStartTrip` or `handleCompleteTrip` callback should call `await fetchTrips(true)` not `await fetchTrips()`.
- Pull-to-refresh already uses `fetchTrips(true)` correctly.
