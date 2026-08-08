---
name: Expo Router root path collision across role groups
description: Multiple top-level (group)/index.tsx files all resolve to the same bare "/" path; cold start/reload picks one non-deterministically-looking (but actually deterministic) winner regardless of user role.
---

Expo Router strips group-name parentheses when generating routes, so every top-level `(group)/index.tsx` resolves to the same bare path `/`. If several role-specific groups each have their own `index.tsx` (e.g. `(profile)`, `(stakeholder)`, `(stateadmin)`, `(superadmin)`, `(tripadmin)`, `(tabs)`), a cold app start or full reload can't disambiguate between them — the router resolves `/` to whichever candidate wins its own internal ordering (observed: alphabetically-first non-auth group), independent of the logged-in user's actual role.

**Why this matters:** a root-level auth redirect effect that only *corrects* a mismatch after the fact can silently fail if it treats one of the colliding groups (e.g. a shared "(profile)" screen reachable by every role) as an always-allowed exception — the exception masks the ambiguous landing instead of catching it, since from the effect's point of view it looks like a legitimate visit.

**How to apply / fix approach used:** rather than renaming every colliding index file (large blast radius — many groups' bare paths are referenced by `router.replace('/(role)')` calls elsewhere), track whether the redirect effect is handling the *first* route resolution since app mount (a ref flag). On that first resolution only, force the correct role-group redirect unconditionally (no "always allowed" exceptions except genuinely public/deep-linkable groups). Once settled, allow normal in-app navigation to shared screens like profile. This closes the bug without touching the underlying file-based route collision.
