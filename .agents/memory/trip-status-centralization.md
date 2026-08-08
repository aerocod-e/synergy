---
name: Trip status centralization
description: Why trip-status labels/colors are NOT a single unified map, even though the status set is centralized.
---

Trip status has one canonical status list/type, but the app has always used **three visually distinct badge color palettes** and **two label variants** ("Pending Cancellation" vs "Pending Cancel") for the same status set — this predates centralization and is intentional, not a bug.

**Why:** unifying the palettes/labels into one map would be a visual regression — each screen's look must stay pixel-identical to before.

**How to apply:** keep the status *list/type* single-sourced (screens that need a narrower subset should derive it, e.g. `Exclude<TripStatus, 'cancellation_pending'>`, rather than hand-redeclaring a union). Per-screen label/color maps may legitimately stay separate exports as long as each derives its values from the canonical constants rather than repeating literals — pick the export matching the screen's existing visual family instead of inventing a new unified one. Statuses on unrelated enums (e.g. trip event types, cancellation-request approval states) must never be merged into this type even though some values look similar.
