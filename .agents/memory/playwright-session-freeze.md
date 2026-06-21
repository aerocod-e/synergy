---
name: Playwright session freeze in runTest
description: runTest Playwright browser locks onto /__mockup for the entire agent session once any test navigates there; also covers React state staleness.
---

## CRITICAL: /__mockup browser contamination (agent-session level)

Once any `runTest` call navigates the Playwright browser to `/__mockup` (e.g. via the A4 back-navigation test), **every subsequent `runTest` call in that entire agent session fails** — the browser starts at `/__mockup` regardless of `[New Context]`, `about:blank` intermediate steps, or `restart:true` on the `code_execution` notebook. The notebook restart does NOT reset the external Playwright service's browser state.

**Cause:** The `runTest` Playwright agent is a separate external service. Its browser context persists for the lifetime of the agent session (not the code_execution notebook). `restart:true` only resets the JS notebook; it has no effect on the Playwright service.

**Fix:** The D–G section browser sweep MUST be run as the **first** `runTest` call in a **brand-new conversation / agent session**, before any test that triggers browser Back navigation. Never run A4 (back-navigation) in the same session as other tests.

**Session ordering rule:** D–G sweep → V1/V2 → then A4 alone in its own isolated fresh session.

---

## React state staleness (separate issue)

When using `runTest` against the Expo (React Native web) app, the Playwright browser can also lock onto an early in-memory React state and **never update**, regardless of:
- `page.goto(url)` — Expo Router treats same-origin navigation as client-side routing; no JS reset
- `page.evaluate(() => localStorage.clear())` — clears storage but React state stays in memory
- In-app logout button — React state resets on paper but screenshots may show old content

**Why:** The Expo SPA handles navigation via Expo Router's client-side routing. The JS context is never torn down by `page.goto()`. The Playwright agent also reuses the same browser context between `runTest` calls within a session.

**How to apply:**
- Verify interactive behaviors via API state checks in `[API]` steps, not by observing UI changes
- Verify visual elements (layout, badges, labels) by reading screenshots, not post-action UI changes
- Use `curl` / direct DB queries to confirm state transitions triggered by button clicks
- Do NOT rely on Playwright screenshots to confirm that `fetchTrips()` updated the React UI after an action
