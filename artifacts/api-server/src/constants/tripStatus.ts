/**
 * Single source of truth for the set of valid trip statuses.
 *
 * This does not introduce any new status values — it only centralizes the
 * literals that were previously duplicated as raw string checks across
 * controllers and services.
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
