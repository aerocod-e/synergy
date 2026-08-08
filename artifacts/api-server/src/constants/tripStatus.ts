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
  'breakdown',
  'transshipment_in_transit',
] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

/** Ergonomic named accessors for call sites, e.g. `TRIP_STATUS.CREATED`. */
export const TRIP_STATUS = {
  CREATED: 'created',
  IN_TRANSIT: 'in_transit',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  CANCELLATION_PENDING: 'cancellation_pending',
  BREAKDOWN: 'breakdown',
  TRANSSHIPMENT_IN_TRANSIT: 'transshipment_in_transit',
} as const satisfies Record<string, TripStatus>;

/**
 * Statuses that count as "this trip is still active" for the purposes of
 * blocking deletion/editing of a vehicle, driver, or trip admin tied to it.
 * A trip that has broken down or is mid-transshipment is still active — it
 * has not completed, been cancelled, or gone through cancellation review.
 */
export const ACTIVE_TRIP_STATUSES = [
  TRIP_STATUS.CREATED,
  TRIP_STATUS.IN_TRANSIT,
  TRIP_STATUS.BREAKDOWN,
  TRIP_STATUS.TRANSSHIPMENT_IN_TRANSIT,
] as const satisfies readonly TripStatus[];

/** SQL-ready quoted list for `status IN (...)` clauses, e.g. `'created', 'in_transit', ...`. */
export const ACTIVE_TRIP_STATUS_SQL_LIST = ACTIVE_TRIP_STATUSES.map((s) => `'${s}'`).join(', ');
