import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { getMyWallet, getMyLedger } from '@/services/api';
import { formatNaira, formatNairaWithSign } from '@/utils/formatCurrency';

type FilterKey = '7d' | '30d' | 'all';

interface LedgerEntry {
  ledgerId: string;
  tripId: string;
  vehicleNumber: string;
  feeType: string;
  amount: number;
  amountNaira: string;
  entryType: 'credit' | 'reversal';
  loadingStateName: string;
  unloadingStateName: string;
  cleared: boolean;
  clearedAt: string | null;
  createdAt: string;
}

interface WalletData {
  totalCollected: number;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: '7d',  label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

function formatWAT(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getFilterParams(filter: FilterKey): Record<string, string> {
  if (filter === 'all') return {};
  const days = filter === '7d' ? 7 : 30;
  const past = new Date();
  past.setDate(past.getDate() - days);
  return { startDate: past.toISOString().split('T')[0]! };
}

export default function StakeholderHome() {
  const [wallet,      setWallet]      = useState<WalletData | null>(null);
  const [entries,     setEntries]     = useState<LedgerEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const fetchData = useCallback(async (filter: FilterKey, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    setFetchError(null);
    try {
      const params = getFilterParams(filter);
      const [walletRes, ledgerRes] = await Promise.all([
        getMyWallet(),
        getMyLedger(Object.keys(params).length > 0 ? params : undefined),
      ]);
      setWallet(walletRes.data?.wallet ?? null);
      setEntries(ledgerRes.data?.entries ?? []);
    } catch {
      setFetchError("Couldn't load your wallet");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData('all');
  }, [fetchData]);

  const handleFilterChange = (filter: FilterKey) => {
    setActiveFilter(filter);
    fetchData(filter);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.inactive} />
        <Text style={styles.errorTitle}>{fetchError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => fetchData(activeFilter)}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderEntry = ({ item }: { item: LedgerEntry }) => (
    <View style={styles.card}>
      <View style={styles.cardMain}>
        <View style={styles.routeRow}>
          <Ionicons name="navigate-outline" size={14} color={theme.colors.grey1} />
          <Text style={styles.routeText} numberOfLines={1}>
            {item.loadingStateName} → {item.unloadingStateName}
          </Text>
        </View>
        <View style={styles.vehicleRow}>
          <Ionicons name="car-outline" size={13} color={theme.colors.grey1} />
          <Text style={styles.vehicleText}>{item.vehicleNumber}</Text>
        </View>
        <Text style={styles.dateText}>{formatWAT(item.createdAt)}</Text>
      </View>
      <Text style={[
        styles.amount,
        item.entryType === 'credit' ? styles.credit : styles.reversal,
      ]}>
        {formatNairaWithSign(item.amount, item.entryType)}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>TOTAL COLLECTED</Text>
        <Text style={styles.balanceAmount}>
          {wallet ? formatNaira(wallet.totalCollected) : '₦0.00'}
        </Text>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, activeFilter === f.key && styles.chipActive]}
            onPress={() => handleFilterChange(f.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, activeFilter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.ledgerId}
        renderItem={renderEntry}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchData(activeFilter, true)}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={theme.colors.inactive} />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptySubtitle}>
              {activeFilter === 'all'
                ? 'Ledger entries will appear here'
                : 'No entries in this date range'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  balanceCard: {
    margin: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    ...theme.shadows.strong,
  },
  balanceLabel: {
    ...theme.typography.sectionLabel,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 6,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.white,
    letterSpacing: 0.5,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.inactive,
  },
  chipActive: {
    backgroundColor: theme.colors.blueMuted,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  chipTextActive: {
    color: theme.colors.primary,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    ...theme.shadows.card,
  },
  cardMain: {
    flex: 1,
    gap: 5,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  routeText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
    flex: 1,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  vehicleText: {
    fontSize: 13,
    color: theme.colors.grey2,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: theme.colors.grey1,
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 12,
    minWidth: 90,
    textAlign: 'right',
  },
  credit: {
    color: theme.colors.greenText,
  },
  reversal: {
    color: theme.colors.error,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.grey2,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.grey1,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.grey2,
    marginTop: 12,
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.white,
  },
});
