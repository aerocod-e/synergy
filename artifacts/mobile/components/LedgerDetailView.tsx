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

export interface LedgerEntry {
  ledgerId: string;
  tripId: string;
  vehicleNumber: string;
  vehicleTypeName: string;
  feeType: string;
  amount: number;
  amountNaira: string;
  entryType: 'credit' | 'reversal';
  loadingStateName: string;
  unloadingStateName: string;
  cleared: boolean;
  clearedAt: string | null;
  createdAt: string;
  tripFees: TripFee[];
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

  const myFee = entry.tripFees.find(
    (f) => f.recipientId === viewerId && f.recipientType === viewerType,
  );

  const totalAmount = entry.tripFees.reduce((s, f) => s + f.amount, 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Trip Summary Card ─────────────────────────────────────────── */}
      <View style={styles.summaryCard}>
        <View style={styles.routeRow}>
          <Navigation size={15} color={theme.colors.primary} />
          <Text style={styles.routeText} numberOfLines={2}>
            {entry.loadingStateName} → {entry.unloadingStateName}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Car size={14} color={theme.colors.grey1} />
          <Text style={styles.infoText}>{entry.vehicleNumber}</Text>
        </View>

        <View style={styles.infoRow}>
          <Truck size={14} color={theme.colors.grey1} />
          <Text style={styles.infoText}>{entry.vehicleTypeName}</Text>
        </View>

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

        {entry.tripFees.length === 0 ? (
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

        {myFee == null && (
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
