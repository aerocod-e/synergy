import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Navigation, Car, Truck, Calendar, ArrowDownCircle, ArrowUpCircle } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { formatNaira, formatNairaWithSign } from '@/utils/formatCurrency';

export interface TripFee {
  id: string;
  feeType: string;
  recipientType: string;
  recipientId: string;
  recipientName: string;
  amount: number;
}

export interface BulkPaymentShare {
  id: string;
  recipientType: string;
  recipientId: string;
  recipientName: string | null;
  percentage: number;
  amount: number;
}

export interface LedgerEntry {
  ledgerId: string;
  tripId: string | null;
  bulkPaymentId?: string | null;
  companyName?: string | null;
  vehicleNumber: string | null;
  vehicleTypeName: string | null;
  feeType: string | null;
  amount: number;
  amountNaira: string;
  entryType: 'credit' | 'reversal';
  loadingStateName: string | null;
  unloadingStateName: string | null;
  cleared: boolean;
  clearedAt: string | null;
  createdAt: string;
  tripFees: TripFee[];
  bulkPaymentShares?: BulkPaymentShare[];
}

interface Props {
  entry: LedgerEntry;
  viewerId: string;
  viewerType: string;
}

function formatWAT(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function feeLabel(fee: TripFee): string {
  if (fee.feeType === 'loading')       return `${fee.recipientName} (Loading)`;
  if (fee.feeType === 'unloading')     return `${fee.recipientName} (Unloading)`;
  return fee.recipientName;
}

export default function LedgerDetailView({ entry, viewerId, viewerType }: Props) {
  const isReversal = entry.entryType === 'reversal';
  const isBulkPayment = !!entry.bulkPaymentId;

  const myFee = entry.tripFees.find(
    (f) => f.recipientId === viewerId && f.recipientType === viewerType,
  );
  const myShare = (entry.bulkPaymentShares ?? []).find(
    (s) => s.recipientId === viewerId && s.recipientType === viewerType,
  );

  const totalAmount = entry.tripFees.reduce((s, f) => s + f.amount, 0);
  const totalShareAmount = (entry.bulkPaymentShares ?? []).reduce((s, f) => s + f.amount, 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Summary Card ──────────────────────────────────────────────── */}
      <View style={styles.summaryCard}>
        {isBulkPayment ? (
          <View style={styles.routeRow}>
            <Navigation size={15} color={theme.colors.primary} />
            <Text style={styles.routeText} numberOfLines={2}>
              {entry.companyName ?? 'Bulk Payment'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.routeRow}>
              <Navigation size={15} color={theme.colors.primary} />
              <Text style={styles.routeText} numberOfLines={2}>
                {entry.loadingStateName ?? 'Unknown'} → {entry.unloadingStateName ?? 'Unknown'}
              </Text>
            </View>

            {entry.vehicleNumber && (
              <View style={styles.infoRow}>
                <Car size={14} color={theme.colors.grey1} />
                <Text style={styles.infoText}>{entry.vehicleNumber}</Text>
              </View>
            )}

            {entry.vehicleTypeName && (
              <View style={styles.infoRow}>
                <Truck size={14} color={theme.colors.grey1} />
                <Text style={styles.infoText}>{entry.vehicleTypeName}</Text>
              </View>
            )}
          </>
        )}

        <View style={styles.infoRow}>
          <Calendar size={14} color={theme.colors.grey1} />
          <Text style={styles.infoText}>{formatWAT(entry.createdAt)}</Text>
        </View>
      </View>

      {/* ── Your Credit Card ──────────────────────────────────────────── */}
      <View style={[styles.creditCard, isReversal && styles.creditCardReversal]}>
        <View style={styles.creditIconRow}>
          {isReversal
            ? <ArrowUpCircle size={20} color={theme.colors.error} />
            : <ArrowDownCircle size={20} color={theme.colors.greenText} />
          }
          <Text style={[styles.creditLabel, isReversal && styles.creditLabelReversal]}>
            {isReversal ? 'Reversed' : 'You received'}
          </Text>
        </View>
        <Text style={[styles.creditAmount, isReversal && styles.creditAmountReversal]}>
          {formatNairaWithSign(entry.amount, entry.entryType)}
        </Text>
      </View>

      {/* ── Payment Breakdown ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PAYMENT BREAKDOWN</Text>

        {isBulkPayment ? (
          (entry.bulkPaymentShares ?? []).length === 0 ? (
            <View style={styles.breakdownCard}>
              <Text style={styles.emptyBreakdown}>No share breakdown available</Text>
            </View>
          ) : (
            <View style={styles.breakdownCard}>
              {(entry.bulkPaymentShares ?? []).map((share, idx) => {
                const isMyShare = share.recipientId === viewerId && share.recipientType === viewerType;
                const isLast = idx === (entry.bulkPaymentShares ?? []).length - 1;
                return (
                  <View key={share.id} style={[styles.feeRow, !isLast && styles.feeRowBorder]}>
                    <View style={styles.feeLabelRow}>
                      <Text style={styles.feeName}>
                        {share.recipientName ?? 'Unknown'} ({share.percentage.toFixed(2)}%)
                      </Text>
                      {isMyShare && (
                        <View style={styles.yourShareBadge}>
                          <Text style={styles.yourShareText}>Your share</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.feeAmount, isMyShare && styles.feeAmountHighlight]}>
                      {formatNaira(share.amount)}
                    </Text>
                  </View>
                );
              })}

              {/* Total row */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL COLLECTED</Text>
                <Text style={styles.totalAmount}>{formatNaira(totalShareAmount)}</Text>
              </View>
            </View>
          )
        ) : entry.tripFees.length === 0 ? (
          <View style={styles.breakdownCard}>
            <Text style={styles.emptyBreakdown}>No fee breakdown available</Text>
          </View>
        ) : (
          <View style={styles.breakdownCard}>
            {entry.tripFees.map((fee, idx) => {
              const isMyFee = fee.recipientId === viewerId && fee.recipientType === viewerType;
              const isLast = idx === entry.tripFees.length - 1;
              return (
                <View key={fee.id} style={[styles.feeRow, !isLast && styles.feeRowBorder]}>
                  <View style={styles.feeLabelRow}>
                    <Text style={styles.feeName}>{feeLabel(fee)}</Text>
                    {isMyFee && (
                      <View style={styles.yourShareBadge}>
                        <Text style={styles.yourShareText}>Your share</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.feeAmount, isMyFee && styles.feeAmountHighlight]}>
                    {formatNaira(fee.amount)}
                  </Text>
                </View>
              );
            })}

            {/* Total row */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL COLLECTED</Text>
              <Text style={styles.totalAmount}>{formatNaira(totalAmount)}</Text>
            </View>
          </View>
        )}

        {isBulkPayment
          ? myShare == null && (
              <Text style={styles.noShareNote}>
                Your share entry was not found in the breakdown for this bulk payment.
              </Text>
            )
          : myFee == null && (
              <Text style={styles.noShareNote}>
                Your fee entry was not found in the breakdown for this trip.
              </Text>
            )}
      </View>

      <View style={{ height: theme.PILL_NAV_BOTTOM_PADDING }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },

  // summary card
  summaryCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    padding: 18,
    gap: 10,
    ...theme.shadows.card,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  routeText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.black,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: theme.colors.grey2,
    fontWeight: '500',
  },

  // credit card
  creditCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 6,
  },
  creditCardReversal: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  creditIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creditLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.greenText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  creditLabelReversal: {
    color: theme.colors.error,
  },
  creditAmount: {
    fontSize: 30,
    fontWeight: '800',
    color: theme.colors.greenText,
    letterSpacing: 0.3,
  },
  creditAmountReversal: {
    color: theme.colors.error,
  },

  // breakdown section
  section: {
    gap: 8,
  },
  sectionTitle: {
    ...theme.typography.sectionLabel,
    color: theme.colors.grey1,
    paddingHorizontal: 4,
  },
  breakdownCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  feeRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  feeLabelRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginRight: 12,
  },
  feeName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.black,
  },
  yourShareBadge: {
    backgroundColor: theme.colors.blueMuted,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  yourShareText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  feeAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.grey2,
  },
  feeAmountHighlight: {
    color: theme.colors.primary,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.separator,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.grey1,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  totalAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.black,
  },

  emptyBreakdown: {
    fontSize: 14,
    color: theme.colors.grey1,
    textAlign: 'center',
    padding: 20,
  },
  noShareNote: {
    fontSize: 12,
    color: theme.colors.grey1,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
});
