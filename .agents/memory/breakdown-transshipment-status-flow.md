---
name: Breakdown/transshipment status flow decisions
description: Which trip statuses can transition into/out of breakdown and transshipment_in_transit, and why completeTrip and markTripBreakdown were widened beyond the original spec wording.
---

The trip status machine has two breakdown-related statuses: `breakdown` and `transshipment_in_transit`. Two deliberate widenings were made beyond a literal first reading of the feature spec, so a trip can cycle through repeated breakdowns and still finish normally:

- `markTripBreakdown` accepts trips currently in `created`, `in_transit`, **or `transshipment_in_transit`** as valid source statuses (not just `created`/`in_transit`). Without this, a trip could only break down once — after its first transshipment it would be stuck and could never break down again.
- `completeTrip` accepts `in_transit` **or `transshipment_in_transit`** as valid source statuses (not just `in_transit`). Without this, any trip that ever had a breakdown/transshipment could never be marked completed, which would be a dead end for the trip lifecycle.

**Why:** A truck breakdown mid-route is exactly the kind of event that can plausibly happen more than once on the same trip (repeated mechanical failure), and the trip must still be completable afterward — the feature would be pointless otherwise. This was also required to satisfy the feature's own verification requirement of testing repeated breakdown→swap cycles on one trip.

**How to apply:** If trip status logic is touched again, treat `breakdown` and `transshipment_in_transit` as active/in-progress statuses equivalent to `in_transit` for lifecycle purposes (can break down again, can complete), not as terminal or one-shot statuses.
