---
name: Expo Playwright internal URL
description: runTest against Expo web apps must use the internal localhost dev server URL, not the external replit.dev preview domain.
---

`runTest`'s Playwright browser cannot reach the external `*.expo.kirk.replit.dev` (or similar `REPLIT_DEV_DOMAIN`-based) preview URL from inside the test container — navigation there renders a permanently blank page and the login UI never appears.

**Fix:** Point `[Browser] Navigate to ...` steps at the Expo dev server's internal URL instead, e.g. `http://localhost:<port>/` (find the port from the workflow's dev server config, e.g. `18115` in this project). This loads the same app instantly.

**How to apply:** Whenever writing a `runTest` test plan for an Expo (React Native web) artifact, use the internal `http://localhost:<port>/` URL as the navigation target and mention it explicitly in `relevantTechnicalDocumentation` so the testing subagent doesn't default to the external domain.
