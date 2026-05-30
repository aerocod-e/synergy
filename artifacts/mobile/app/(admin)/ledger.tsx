import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '@/constants/theme';
import { getMyLedger } from '@/services/api';
import { formatNaira, formatNairaWithSign } from '@/utils/formatCurrency';
import { useAuth } from '@/hooks/useAuth';
import type { WalletLedgerEntry, FeeType } from '@/types';

type FilterPill = 'All' | 'Loading' | 'Unloading' | 'Stakeholder Fee';

const STATE_PILLS: FilterPill[]       = ['All', 'Loading', 'Unloading'];
const STAKEHOLDER_PILLS: FilterPill[] = ['All', 'Stakeholder Fee'];
const ALL_PILLS: FilterPill[]         = ['All', 'Loading', 'Unloading', 'Stakeholder Fee'];

const PILL_FEE_MAP: Record<FilterPill, FeeType | null> = {
  All: null,
  Loading: 'loading',
  Unloading: 'unloading',
  'Stakeholder Fee': 'stakeholder_fee',
};

const FEE_LABEL: Record<FeeType, string> = {
  loading: 'Loading Fee',
  unloading: 'Unloading Fee',
  stakeholder_fee: 'Stakeholder Fee',
};

interface LedgerSummary {
  totalCredits: number;
  totalReversals: number;
  netTotal: number;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).replace(',', ',');
  } catch {
    return '';
  }
}

function SkeletonBlock({ width, height, borderRadius = 6 }: { width: number | string; height: number; borderRadius?: number }) {
  return <View style={[styles.skeletonBlock, { width: width as number, height, borderRadius }]} />;
}

function SkeletonEntryCard() {
  return (
    <View style={styles.entryCard}>
      <View style={styles.entryRow}>
        <SkeletonBlock width={110} height={14} />
        <SkeletonBlock width={90} height={18} borderRadius={8} />
      </View>
      <View style={[styles.entryRow, { marginTop: 8 }]}>
        <SkeletonBlock width={80} height={12} />
        <SkeletonBlock width={60} height={22} borderRadius={8} />
      </View>
      <SkeletonBlock width={120} height={11} borderRadius={5} />
    </View>
  );
}

function EntryCard({ entry }: { entry: WalletLedgerEntry }) {
  const isCredit = entry.entryType === 'credit';
  return (
    <View style={styles.entryCard}>
      <View style={styles.entryRow}>
        <Text style={styles.feeTypeLabel}>{FEE_LABEL[entry.feeType] ?? entry.feeType}</Text>
        <Text style={[styles.amountText, isCredit ? styles.amountCredit : styles.amountReversal]}>
          {formatNairaWithSign(entry.amount, entry.entryType)}
        </Text>
      </View>
      <View style={[styles.entryRow, { marginTop: 6 }]}>
        <Text style={styles.vehicleNumber}>{entry.vehicleNumber}</Text>
        <View style={[styles.clearedBadge, entry.cleared ? styles.clearedBadgeYes : styles.clearedBadgeNo]}>
          <Text style={[styles.clearedBadgeText, entry.cleared ? styles.clearedBadgeTextYes : styles.clearedBadgeTextNo]}>
            {entry.cleared ? 'Cleared' : 'Pending'}
          </Text>
        </View>
      </View>
      <Text style={styles.dateText}>{formatDate(entry.createdAt)}</Text>
    </View>
  );
}

export default function Ledger() {
  const { user } = useAuth();
  const visiblePills: FilterPill[] =
    user?.entityType === 'state'       ? STATE_PILLS :
    user?.entityType === 'stakeholder' ? STAKEHOLDER_PILLS :
    ALL_PILLS;

  const [entries, setEntries] = useState<WalletLedgerEntry[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterPill>('All');

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getMyLedger({ limit: '100' });
      const list: WalletLedgerEntry[] = Array.isArray(data?.entries) ? data.entries : [];
      setEntries(list);
      setSummary(data?.summary ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const activeFeeType = PILL_FEE_MAP[activeFilter];
  const filteredEntries = activeFeeType
    ? entries.filter((e) => e.feeType === activeFeeType)
    : entries;

  return (
    <View style={styles.container}>
      {/* Summary bar */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Credits</Text>
          <Text style={[styles.summaryValue, styles.summaryCredit]}>
            {summary ? formatNaira(summary.totalCredits) : '₦0.00'}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Reversals</Text>
          <Text style={[styles.summaryValue, styles.summaryReversal]}>
            {summary ? formatNaira(Math.abs(summary.totalReversals)) : '₦0.00'}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Net Total</Text>
          <Text style={styles.summaryValue}>
            {summary ? formatNaira(summary.netTotal) : '₦0.00'}
          </Text>
        </View>
      </View>

      {/* Filter pills */}
      <View style={styles.pillsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContainer}
        >
          {visiblePills.map((pill) => {
            const active = activeFilter === pill;
            return (
              <TouchableOpacity
                key={pill}
                onPress={() => setActiveFilter(pill)}
                activeOpacity={0.75}
                style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
              >
                <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
                  {pill}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.skeletonArea}>
          <SkeletonEntryCard />
          <SkeletonEntryCard />
          <SkeletonEntryCard />
        </View>
      ) : error ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>Failed to load ledger</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchLedger}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filteredEntries}
          keyExtractor={(item) => item.ledgerId}
          contentContainerStyle={filteredEntries.length === 0 ? styles.emptyList : styles.listContent}
          renderItem={({ item }) => <EntryCard entry={item} />}
          ListEmptyComponent={
            <View style={styles.centeredState}>
              <Text style={styles.emptyIcon}>○</Text>
              <Text style={styles.emptyText}>No entries found</Text>
              {activeFilter !== 'All' && (
                <Text style={styles.emptySubText}>Try selecting a different filter</Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    margin: 16,
    marginBottom: 8,
    padding: 16,
    ...theme.shadows.card,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: theme.colors.separator,
    marginVertical: 2,
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.grey1,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.black,
  },
  summaryCredit: {
    color: theme.colors.greenText,
  },
  summaryReversal: {
    color: '#c8401a',
  },
  pillsWrapper: {
    height: 50,
    justifyContent: 'center',
  },
  pillsContainer: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillInactive: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#e4e8ef',
  },
  pillText: {
    fontSize: 13,
    lineHeight: 18,
  },
  pillTextActive: {
    color: theme.colors.white,
    fontWeight: '600',
  },
  pillTextInactive: {
    color: theme.colors.grey1,
  },
  skeletonArea: {
    paddingTop: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  emptyList: {
    flexGrow: 1,
  },
  entryCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    padding: 14,
    ...theme.shadows.card,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feeTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
  },
  amountCredit: {
    color: theme.colors.greenText,
  },
  amountReversal: {
    color: '#c8401a',
  },
  vehicleNumber: {
    fontSize: 13,
    color: theme.colors.grey1,
    fontWeight: '500',
  },
  clearedBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  clearedBadgeYes: {
    backgroundColor: theme.colors.greenMuted,
  },
  clearedBadgeNo: {
    backgroundColor: '#fff8e1',
  },
  clearedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  clearedBadgeTextYes: {
    color: theme.colors.greenText,
  },
  clearedBadgeTextNo: {
    color: '#f59e0b',
  },
  dateText: {
    fontSize: 11,
    color: theme.colors.grey1,
    marginTop: 6,
  },
  skeletonBlock: {
    backgroundColor: theme.colors.black,
    opacity: 0.12,
    marginVertical: 3,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.error,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
  },
  retryButtonText: {
    color: theme.colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyIcon: {
    fontSize: 40,
    color: theme.colors.grey1,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.grey1,
  },
  emptySubText: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginTop: 4,
  },
});
