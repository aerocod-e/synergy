/**
 * ============================================================
 * PAYMENT STATUS SERVICE — PLACEHOLDER IMPLEMENTATION
 * ============================================================
 * Currently, a fee is treated as "paid" simply because a
 * trip_fees row exists for it. This is a placeholder because
 * no real payment processor or clearing mechanism is connected
 * to the system yet. The wallet_ledger.cleared column exists
 * in the schema but is never set to true anywhere in the
 * codebase — all entries remain cleared = false.
 *
 * FUTURE INTEGRATION POINT:
 * This is the SINGLE place to swap in real payment status
 * logic. When a clearing mechanism is added (e.g. checking
 * wallet_ledger.cleared = true, or querying an external payment
 * processor), update only this function. All callers —
 * lookupController, publicLookupController, and any future
 * controllers — will automatically reflect the change.
 *
 * Suggested future implementation:
 *   if (tripFee.cleared) return { status: 'paid', paidAt: tripFee.cleared_at };
 *   return { status: 'pending', paidAt: null };
 * ============================================================
 */

export interface FeePaymentStatus {
  status: 'paid' | 'pending';
  paidAt: string | null;
}

/**
 * Determines the payment status of a single trip fee.
 *
 * @param tripFee - The trip_fees row, or null if the fee was not recorded for this trip
 * @param referenceDate - The trip creation date, used as a paidAt placeholder when paid
 * @returns { status: 'paid' | 'pending', paidAt: ISO string or null }
 */
export function getFeePaymentStatus(
  tripFee: { id: string; cleared: boolean } | null,
  referenceDate?: Date,
): FeePaymentStatus {
  if (!tripFee) {
    return { status: 'pending', paidAt: null };
  }

  // Placeholder: a fee row existing is treated as paid.
  // Replace with tripFee.cleared check when real clearing is implemented.
  const paidAt = referenceDate
    ? referenceDate.toISOString()
    : new Date().toISOString();

  return { status: 'paid', paidAt };
}
