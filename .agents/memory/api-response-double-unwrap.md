---
name: apiRequest already unwraps .data — don't double-unwrap
description: apiRequest() returns json.data directly; accessing .data again on the result yields undefined and silently triggers generic error states.
---

The mobile app's `apiRequest()` helper (in `services/api.ts`) already unwraps the backend's `{ data: ... }` envelope and returns `json.data` directly. Screens must consume the resolved value as-is (e.g. `const data = await getTripById(id); setTrip(data.trip)`), not `response.data`.

**Why:** A screen (driver detail) wrote `const driverRes = await getDriver(id); setDriver(driverRes.data)`, which set state to `undefined` since `driverRes` was already the unwrapped object. No exception was thrown, so the generic `catch { setError(true) }` never fired and no console error appeared — but the render guard `if (error || !driver)` still matched on the falsy `driver`, permanently showing a generic "Failed to load X" error with no diagnostic trail. This is easy to miss because curl/API testing of the same endpoint succeeds (200, correct body), masking that the bug is purely in frontend response handling.

**How to apply:** When a screen shows a persistent generic load-failure with a clean network response and no console errors, check for `.data` being accessed twice — once inside `apiRequest` and again by the caller. Cross-check against a working sibling screen (e.g. trip-detail.tsx) for the correct consumption pattern before assuming a backend or network issue.
