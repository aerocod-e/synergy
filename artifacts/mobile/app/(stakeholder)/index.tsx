import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Car, CloudOff, ExternalLink, Navigation, Receipt } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import ScreenTransition from '@/components/ScreenTransition';
import SlideUpList from '@/components/SlideUpList';
import SearchBar from '@/components/SearchBar';
import DateRangeFilter, { getDateRangeParams, type DateRangeValue } from '@/components/DateRangeFilter';
import { getMyWallet, getMyLedger } from '@/services/api';
import { formatNaira, formatNairaWithSign } from '@/utils/formatCurrency';

type EntryTypeFilter = 'all' | 'credit' | 'reversal';

interface TripFee {
  id: string;
  feeType: string;
  recipientType: string;
  recipientId: string;
  recipientName: string;
  amount: number;
}

interface LedgerEntry {
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

interface WalletData {
  totalCollected: number;
}

const ENTRY_TYPE_FILTERS: { key: EntryTypeFilter; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'credit',   label: 'Credits' },
  { key: 'reversal', label: 'Reversals' },
];

const PAGE_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 400;

function formatWAT(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function StakeholderHome() {
  const router = useRouter();
  const [wallet,        setWallet]        = useState<WalletData | null>(null);
  const [entries,       setEntries]       = useState<LedgerEntry[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [fetchError,    setFetchError]    = useState<string | null>(null);
  const [dateRange,     setDateRange]     = useState<DateRangeValue>({ preset: 'all' });
  const [entryType,     setEntryType]     = useState<EntryTypeFilter>('all');
  const [searchInput,   setSearchInput]   = useState('');
  const [search,        setSearch]        = useState('');

  // pagination
  const [page,         setPage]         = useState(1);
  const [hasMore,      setHasMore]      = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);

  // debounce search input → search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const buildParams = useCallback((pageNum: number): Record<string, string> => {
    const params: Record<string, string> = {
      ...getDateRangeParams(dateRange),
      page: String(pageNum),
      limit: String(PAGE_LIMIT),
    };
    if (search) params.search = search;
    if (entryType !== 'all') params.entryType = entryType;
    return params;
  }, [dateRange, entryType, search]);

  // ── initial / filter / refresh fetch (always replaces entries) ───────────

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    setFetchError(null);
    setPage(1);
    try {
      const params = buildParams(1);
      const [walletRes, ledgerRes] = await Promise.all([
        getMyWallet(),
        getMyLedger(params),
      ]);
      setWallet(walletRes.wallet ?? null);
      setEntries(ledgerRes.entries ?? []);
      const pg = ledgerRes.pagination ?? {};
      setHasMore((pg.page ?? 1) < (pg.totalPages ?? 1));
    } catch {
      setFetchError("Couldn't load your wallet");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── load more (appends) ──────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const params = buildParams(nextPage);
      const ledgerRes = await getMyLedger(params);
      setEntries((prev) => [...prev, ...(ledgerRes.entries ?? [])]);
      const pg = ledgerRes.pagination ?? {};
      setHasMore((pg.page ?? nextPage) < (pg.totalPages ?? nextPage));
      setPage(nextPage);
    } catch {
      // silent — existing entries stay, user can tap again
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, buildParams]);

  // ── summary computed from currently-loaded entries ───────────────────────

  const totalCredits   = entries.reduce((s, e) => e.entryType === 'credit'   ? s + e.amount : s, 0);
  const totalReversals = entries.reduce((s, e) => e.entryType === 'reversal' ? s + e.amount : s, 0);
  const netTotal       = totalCredits + totalReversals;

  // ── loading / error guards ───────────────────────────────────────────────

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
        <CloudOff size={48} color={theme.colors.inactive} />
        <Text style={styles.errorTitle}>{fetchError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => fetchData()}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── render helpers ───────────────────────────────────────────────────────

  const renderEntry = ({ item }: { item: LedgerEntry }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() =>
        router.push({
          pathname: '/(stakeholder)/ledger-detail',
          params: { entry: JSON.stringify(item) },
        })
      }
    >
      <View style={styles.cardMain}>
        <View style={styles.routeRow}>
          <Navigation size={14} color={theme.colors.grey1} />
          <Text style={styles.routeText} numberOfLines={1}>
            {item.loadingStateName} → {item.unloadingStateName}
          </Text>
        </View>
        <View style={styles.vehicleRow}>
          <Car size={13} color={theme.colors.grey1} />
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
    </TouchableOpacity>
  );

  const renderFooter = () => (
    <>
      {hasMore && (
        <TouchableOpacity
          style={styles.loadMoreBtn}
          onPress={loadMore}
          disabled={loadingMore}
          activeOpacity={0.8}
        >
          {loadingMore ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Text style={styles.loadMoreText}>Load more</Text>
          )}
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.verifyLink}
        onPress={() => router.push('/(public)/lookup')}
        activeOpacity={0.7}
      >
        <Text style={styles.verifyLinkText}>Verify a payment publicly</Text>
        <ExternalLink size={14} color={theme.colors.primary} />
      </TouchableOpacity>
      <View style={{ height: theme.PILL_NAV_BOTTOM_PADDING }} />
    </>
  );

  // ── main render ──────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <TopBar />
      <ScreenTransition style={{ flex: 1 }} sheet>
      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>TOTAL COLLECTED</Text>
        <Text style={styles.balanceAmount}>
          {wallet ? formatNaira(wallet.totalCollected) : '₦0.00'}
        </Text>
      </View>

      {/* Search */}
      <SearchBar
        value={searchInput}
        onChangeText={setSearchInput}
        placeholder="Search by trip, vehicle, or route…"
      />

      {/* Date range filter */}
      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {/* Entry type chips */}
      <View style={styles.filterRow}>
        {ENTRY_TYPE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, entryType === f.key && styles.chipActive]}
            onPress={() => setEntryType(f.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, entryType === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary row */}
      {entries.length > 0 && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>CREDITS</Text>
            <Text style={[styles.summaryAmount, styles.summaryCredit]}>{formatNaira(totalCredits)}</Text>
          </View>
          <View style={styles.summarySeparator} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>REVERSALS</Text>
            <Text style={[styles.summaryAmount, styles.summaryReversal]}>−{formatNaira(Math.abs(totalReversals))}</Text>
          </View>
          <View style={styles.summarySeparator} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>NET TOTAL</Text>
            <Text style={[styles.summaryAmount, styles.summaryNet]}>{formatNaira(netTotal)}</Text>
          </View>
        </View>
      )}

      {/* Ledger list */}
      <SlideUpList style={{ flex: 1 }}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.ledgerId}
        renderItem={renderEntry}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Receipt size={48} color={theme.colors.inactive} />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptySubtitle}>
              {dateRange.preset === 'all' && entryType === 'all' && !search
                ? 'Ledger entries will appear here'
                : 'No entries match your filters'}
            </Text>
          </View>
        }
        ListFooterComponent={renderFooter}
      />
      </SlideUpList>
      </ScreenTransition>
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

  // balance card
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

  // filter chips
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
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

  // summary row
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    ...theme.shadows.card,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summarySeparator: {
    width: 1,
    backgroundColor: theme.colors.separator,
    marginVertical: 4,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.grey1,
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryCredit: {
    color: theme.colors.greenText,
  },
  summaryReversal: {
    color: theme.colors.error,
  },
  summaryNet: {
    color: theme.colors.primary,
  },

  // list
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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

  // load more
  loadMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 10,
    minHeight: 44,
    ...theme.shadows.card,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // verify link
  verifyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingBottom: 24,
  },
  verifyLinkText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500',
  },

  // empty / error
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
