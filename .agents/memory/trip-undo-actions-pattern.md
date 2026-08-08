---
name: Trip status undo actions pattern
description: How undo-start/undo-breakdown/undo-transshipment endpoints and their UI gate eligibility, and why requestCancellation is permissive by default.
---

**Undo endpoints gate purely on the trip's *current* status** (e.g. undo-transshipment only runs when status is exactly `transshipment_in_transit`), not on deep event-history traversal. Each undo reverts to whatever the single most recent related event/history row recorded (previous status from `breakdown_marked` metadata, previous vehicle/driver from the latest `trip_transshipment_history` row), inserts its own `undo_*` event, and is wrapped in `SELECT ... FOR UPDATE` on the trip row for ownership + race safety.

**Why:** This makes "you can't undo an older action after a newer one happened" fall out for free — once a later action changes the status away from the undo's required precondition, the undo route 409s naturally, without needing to compare event timestamps or walk history. The one exception is `undo-start`, which *does* need an explicit check (no `trip_events` row created after the most recent `started` event) because reverting to `created` doesn't itself change status away from a value another undo route keys on.

**How to apply:** When adding a new undo/reversal action to this trip lifecycle, prefer keying eligibility on current status + "is there a more recent status-changing row" rather than tracking a separate undo-eligibility flag. Frontend undo links mirror this: they show/hide based on the trip's current status only (matching the backend's primary precondition), and rely on the backend's rejection message to surface true edge cases inline — the UI does not try to replicate the full server-side eligibility logic.

**Related:** `requestCancellation` uses a **deny-list** (blocks only `completed`/`cancelled`/`cancellation_pending`), not an allow-list — so `breakdown` and `transshipment_in_transit` were already cancellable server-side before any frontend change; adding a new terminal/blocked status requires updating that deny-list explicitly, or it becomes cancellable by default.
