import { theme } from './theme';

/**
 * Single source of truth for the set of valid trip statuses on the client.
 *
 * This does not introduce any new status values — it only centralizes the
 * literals, label text, filter lists, and badge colors that were previously
 * redeclared independently in every screen that renders a trip status.
 *
 * NOTE ON COLOR/LABEL VARIANTS: different screens in the app today render
 * trip statuses with different visual treatments (this predates this file).
 * Rather than silently unifying them — which would be a visual change — this
 * file exposes each variant that is actually in use, named after where it is
 * used, so every screen can keep looking exactly as it did before.
 */

export const TRIP_STATUSES = [
  'created',
  'in_transit',
  'completed',
  'cancelled',
  'cancellation_pending',
] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

/** Ergonomic named accessors for call sites, e.g. `TRIP_STATUS.CREATED`. */
export const TRIP_STATUS = {
  CREATED: 'created',
  IN_TRANSIT: 'in_transit',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  CANCELLATION_PENDING: 'cancellation_pending',
} as const satisfies Record<string, TripStatus>;

// ── Labels ───────────────────────────────────────────────────────────────────

/**
 * Canonical human-readable label per status. Used as-is by TripDetailView.
 */
export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  created: 'Created',
  in_transit: 'In Transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
  cancellation_pending: 'Pending Cancellation',
};

/**
 * Same as TRIP_STATUS_LABELS, except the trip-admin screens (trips list,
 * trip detail PDF export, audit report) have always shown "Pending Cancel"
 * (not "Pending Cancellation") for this one status. Preserved verbatim.
 */
export const TRIP_ADMIN_STATUS_LABELS: Record<TripStatus, string> = {
  ...TRIP_STATUS_LABELS,
  cancellation_pending: 'Pending Cancel',
};

// ── Status filter list (All / Created / In Transit / Completed / Cancelled) ──
// Shared by every screen with a filter-pill row. None of these expose
// "Pending Cancellation" as a filter option today.

export type TripStatusFilterOption = 'All' | 'Created' | 'In Transit' | 'Completed' | 'Cancelled';

export const TRIP_STATUS_FILTER_OPTIONS: TripStatusFilterOption[] = [
  'All',
  'Created',
  'In Transit',
  'Completed',
  'Cancelled',
];

export const TRIP_STATUS_FILTER_MAP: Record<TripStatusFilterOption, TripStatus | null> = {
  All: null,
  Created: 'created',
  'In Transit': 'in_transit',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

// ── Badge colors ─────────────────────────────────────────────────────────────

export interface TripStatusBadgeStyle {
  bg: string;
  text: string;
}

/**
 * "Admin" badge palette — used by State Admin & Super Admin trip lists, and
 * TripDetailView (the trip-detail screen shared by multiple roles).
 */
export const ADMIN_TRIP_STATUS_BADGE_COLORS: Record<TripStatus, TripStatusBadgeStyle> = {
  created: { bg: '#e8f0fb', text: '#1a6ec8' },
  in_transit: { bg: '#fff8e1', text: '#f59e0b' },
  completed: { bg: '#e8f5ec', text: '#2a8a4a' },
  cancelled: { bg: '#fdf0ed', text: '#c8401a' },
  cancellation_pending: { bg: '#fff4ed', text: '#ea580c' },
};

/**
 * Public trip-lookup badge palette (app/(public)/lookup.tsx). Distinct from
 * the admin palette above; has no cancellation_pending entry since the
 * public lookup never shows that status.
 */
export const PUBLIC_TRIP_STATUS_BADGE_COLORS: Record<
  Exclude<TripStatus, 'cancellation_pending'>,
  TripStatusBadgeStyle
> = {
  created: { bg: '#fef3c7', text: '#d97706' },
  in_transit: { bg: '#dbeafe', text: '#1a6ec8' },
  completed: { bg: '#d1fae5', text: '#15803d' },
  cancelled: { bg: '#fee2e2', text: '#dc2626' },
};

/**
 * Trip-admin badge palette — used by the trip-admin trips list and the
 * audit report screen. Mixes theme tokens with a couple of hardcoded hex
 * values, exactly as those two screens historically did.
 */
export const TRIP_ADMIN_STATUS_BADGE_COLORS: Record<TripStatus, TripStatusBadgeStyle> = {
  created: { bg: theme.colors.blueMuted, text: theme.colors.blueText },
  in_transit: { bg: '#fef3c7', text: '#d97706' },
  completed: { bg: theme.colors.greenMuted, text: theme.colors.greenText },
  cancelled: { bg: theme.colors.grey3, text: theme.colors.grey1 },
  cancellation_pending: { bg: '#fff4ed', text: '#ea580c' },
};
