---
name: Wallet ledger shared across entity types (trips + bulk payments)
description: wallet_ledger rows can now originate from trips OR bulk payments (nullable trip_id / bulk_payment_id) — read this before adding a third source or touching getMyLedger.
---

`wallet_ledger` is a single shared table credited by multiple unrelated flows (per-trip fees, and now company bulk payments), distinguished by which nullable foreign key is set.

**Why:** joining trip-related tables with a plain `JOIN` silently excludes any ledger row that didn't originate from a trip — it just vanishes from wallet history with no error, rather than failing loudly.

**How to apply:** any query that lists ledger entries across all sources must outer-join optional origins (don't assume every row has a trip), and any new credit source added later must be handled the same way or its entries will be invisible in wallet history.
