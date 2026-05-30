---
name: Playwright session freeze in runTest
description: The runTest Playwright agent's browser freezes on an early session snapshot for Expo RN web apps and cannot be reset.
---

## The rule
When using `runTest` against the Expo (React Native web) mobile app, the Playwright agent's browser locks onto an early in-memory React state and **never updates**, regardless of:
- `page.goto(url)` (Expo Router treats same-origin navigation as client-side route, no JS reset)
- `page.evaluate(() => localStorage.clear())` (clears storage but React state stays in memory)
- `page.once('dialog', ...)` + button click (dialog fires, API is called, but stale trips state persists)
- Clicking the in-app logout button (React state resets on paper but the screenshot still shows old content)
- Any combination of the above

**Why:** The Expo SPA handles navigation via Expo Router's client-side routing. The JS context (and therefore React component state) is never torn down by `page.goto()`. The Playwright agent also appears to reuse the same browser context between `runTest` calls.

**How to apply:**
- Verify interactive behaviors via API state checks in `[API]` steps, not by observing the UI change
- Verify visual elements (layout, badges, labels) by reading screenshots, not by asserting post-action UI changes
- Use `curl` / direct DB queries to confirm state transitions triggered by button clicks
- Do NOT rely on the Playwright screenshot to confirm that `fetchTrips()` updated the React UI after an action
