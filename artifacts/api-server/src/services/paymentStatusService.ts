/**
 * EOD CLEARING ARCHITECTURE NOTE
 *
 * Each wallet has an `is_clearing_enabled` flag (default: false).
 * Super Admin enables this per wallet (state or stakeholder) when that entity
 * has agreed to receive cleared payments.
 *
 * When EOD clearing runs (future: triggered by payment processor or scheduled job):
 * 1. Only wallets where `is_clearing_enabled = true` are processed
 * 2. All `wallet_ledger` entries where `cleared = false` for that wallet are settled
 * 3. `cleared = true` and `cleared_at = NOW()` are set on each entry
 * 4. The actual payment disbursement happens via the payment processor
 * 5. Wallets that were not yet enabled when EOD runs keep accumulating -- their
 *    backlog will be cleared in the first EOD run after they are enabled
 *
 * The `getFeePaymentStatus` function below currently treats "fee row exists" as "paid"
 * because no real payment processor is connected. When the processor is connected,
 * replace this function's logic with a check on `wallet_ledger.cleared`.
 */

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
  status: 'paid' | 'pending' | 'reversed';
  paidAt: string | null;
}

/**
 * Determines the payment status of a single trip fee.
 *
 * @param tripFee     - The trip_fees row, or null if the fee was not recorded for this trip
 * @param referenceDate - The trip creation date, used as a paidAt placeholder when paid
 * @param tripStatus  - The parent trip's status. When 'cancelled', all fees return 'reversed'
 *                      regardless of whether a fee row exists (cancellation reverses all ledger
 *                      entries via the cancellation flow).
 * @returns { status: 'paid' | 'pending' | 'reversed', paidAt: ISO string or null }
 */
export function getFeePaymentStatus(
  tripFee: { id: string; cleared: boolean } | null,
  referenceDate?: Date,
  tripStatus?: string,
): FeePaymentStatus {
  if (tripStatus === 'cancelled') {
    return { status: 'reversed', paidAt: null };
  }

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
