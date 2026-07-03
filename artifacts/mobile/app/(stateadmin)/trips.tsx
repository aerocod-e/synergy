import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import ScreenTransition from '@/components/ScreenTransition';
import SlideUpList from '@/components/SlideUpList';
import SearchBar from '@/components/SearchBar';
import FilterPanel from '@/components/FilterPanel';
import DateRangeFilter, { getDateRangeParams, type DateRangeValue } from '@/components/DateRangeFilter';
import { getTrips } from '@/services/api';

type TripStatus = 'created' | 'in_transit' | 'completed' | 'cancelled';

interface StateRef {
  id: string;
  name: string;
  code: string;
}

interface Trip {
  id: string;
  tripCode: string | null;
  vehicleNumber: string;
  vehicleTypeName: string | null;
  status: TripStatus;
  loadingState: StateRef;
  unloadingState: StateRef;
  driver: { id: string; email: string } | null;
  createdByName: string | null;
  createdByEmail: string | null;
  unstartedFlag: boolean | null;
  createdAt: string;
}

type FilterOption = 'All' | 'Created' | 'In Transit' | 'Completed' | 'Cancelled';

const FILTER_OPTIONS: FilterOption[] = ['All', 'Created', 'In Transit', 'Completed', 'Cancelled'];

const STATUS_FILTER_MAP: Record<FilterOption, TripStatus | null> = {
  All: null,
  Created: 'created',
  'In Transit': 'in_transit',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

const SEARCH_DEBOUNCE_MS = 400;

const STATUS_BADGE: Record<TripStatus, { bg: string; text: string; label: string }> = {
  created:    { bg: '#e8f0fb', text: '#1a6ec8', label: 'Created' },
  in_transit: { bg: '#fff8e1', text: '#f59e0b', label: 'In Transit' },
  completed:  { bg: '#e8f5ec', text: '#2a8a4a', label: 'Completed' },
  cancelled:  { bg: '#fdf0ed', text: '#c8401a', label: 'Cancelled' },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={[styles.skeleton, { width: 120, height: 17 }]} />
        <View style={[styles.skeleton, { width: 72, height: 22, borderRadius: 8 }]} />
      </View>
      <View style={[styles.skeleton, { width: '70%', height: 14, marginTop: 8 }]} />
      <View style={[styles.skeleton, { width: '50%', height: 13, marginTop: 6 }]} />
    </View>
  );
}

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const badge = STATUS_BADGE[trip.status] ?? STATUS_BADGE.created;
  const label = trip.tripCode ?? trip.vehicleNumber;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardRow}>
        <Text style={styles.vehicleNumber} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={styles.route} numberOfLines={1}>
        {trip.loadingState.name} → {trip.unloadingState.name}
      </Text>
      {trip.createdByName ? (
        <Text style={styles.createdBy} numberOfLines={1}>
          Created by {trip.createdByName}
        </Text>
      ) : null}
      <View style={styles.cardRow}>
        <Text style={styles.driverEmail} numberOfLines={1}>
          {trip.driver?.email ?? '—'}
        </Text>
        <Text style={styles.dateText}>{formatDate(trip.createdAt)}</Text>
      </View>
      {trip.unstartedFlag === true && (
        <>
          <View style={styles.separator} />
          <Text style={styles.unstartedWarning}>⚠ Not started yet</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export default function StateAdminTrips() {
  const router = useRouter();
  const PAGE_LIMIT = 20;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('All');
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: 'all' });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // debounce search input → search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const buildParams = useCallback((pageNum: number): Record<string, string> => {
    const statusValue = STATUS_FILTER_MAP[activeFilter];
    const params: Record<string, string> = {
      ...getDateRangeParams(dateRange),
      page: String(pageNum),
      limit: String(PAGE_LIMIT),
    };
    if (statusValue) params.status = statusValue;
    if (search) params.search = search;
    return params;
  }, [activeFilter, dateRange, search]);

  const fetchTrips = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    setPage(1);
    try {
      const params = buildParams(1);
      const data = await getTrips(params);
      const list: Trip[] = Array.isArray(data?.trips) ? data.trips as Trip[] : [];
      setTrips(list);
      const pg = (data as any)?.pagination ?? {};
      setHasMore((pg.page ?? 1) < (pg.totalPages ?? 1));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildParams]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const params = buildParams(nextPage);
      const data = await getTrips(params);
      const list: Trip[] = Array.isArray(data?.trips) ? data.trips as Trip[] : [];
      setTrips((prev) => [...prev, ...list]);
      const pg = (data as any)?.pagination ?? {};
      setHasMore((pg.page ?? nextPage) < (pg.totalPages ?? nextPage));
      setPage(nextPage);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, buildParams]);

  useFocusEffect(
    useCallback(() => {
      fetchTrips();
    }, [fetchTrips])
  );

  const skeletons = [1, 2, 3, 4];

  const activeFilterCount = (dateRange.preset !== 'all' ? 1 : 0) + (activeFilter !== 'All' ? 1 : 0);
  const dateSummary = dateRange.preset === '7d'
    ? 'Last 7 days'
    : dateRange.preset === '30d'
    ? 'Last 30 days'
    : dateRange.preset === 'custom' && dateRange.startDate && dateRange.endDate
    ? `${dateRange.startDate} → ${dateRange.endDate}`
    : null;
  const summaryParts = [dateSummary, activeFilter !== 'All' ? activeFilter : null].filter(Boolean) as string[];
  const summaryText = summaryParts.length > 0 ? summaryParts.join(', ') : null;

  const clearAllFilters = () => {
    setDateRange({ preset: 'all' });
    setActiveFilter('All');
  };

  return (
    <View style={styles.root}>
      <TopBar />
      <ScreenTransition style={{ flex: 1 }}>
      <SlideUpList style={{ flex: 1 }}>

        {/* Search */}
        <SearchBar
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search by trip, vehicle, or driver…"
        />

        <FilterPanel
          activeFilterCount={activeFilterCount}
          summaryText={summaryText}
          onClearAll={clearAllFilters}
        >
          {/* Date range filter */}
          <DateRangeFilter value={dateRange} onChange={setDateRange} />

          {/* Status filter pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterScrollContent}
          >
            {FILTER_OPTIONS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, activeFilter === f && styles.filterPillActive]}
                onPress={() => setActiveFilter(f)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, activeFilter === f && styles.filterPillTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </FilterPanel>

        {error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Couldn't load trips</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => fetchTrips()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={loading ? [] : trips}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => (
              <TripCard
                trip={item}
                onPress={() => router.push(`/(stateadmin)/trip-detail?id=${item.id}`)}
              />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchTrips(true)}
                tintColor={theme.colors.primary}
              />
            }
            ListHeaderComponent={
              <Text style={styles.sectionLabel}>
                {loading ? 'Loading…' : `Trips (${trips.length}${hasMore ? '+' : ''})`}
              </Text>
            }
            ListEmptyComponent={
              loading ? (
                <View>{skeletons.map((k) => <SkeletonCard key={k} />)}</View>
              ) : (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>
                    {activeFilter === 'All' && dateRange.preset === 'all' && !search
                      ? 'No trips found'
                      : 'No trips match your filters'}
                  </Text>
                </View>
              )
            }
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={() => (
              <View>
                {loadingMore && (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                    style={{ paddingVertical: 16 }}
                  />
                )}
                <View style={{ height: theme.PILL_NAV_BOTTOM_PADDING }} />
              </View>
            )}
          />
        )}

      </SlideUpList>
      </ScreenTransition>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.grey4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  filterPillActive: {
    backgroundColor: theme.colors.blueMuted,
    borderColor: theme.colors.primary,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  filterPillTextActive: {
    color: theme.colors.primary,
  },
  sectionLabel: {
    ...theme.typography.sectionLabel,
    marginTop: 4,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 8,
  },
  card: {
    backgroundColor: theme.colors.white,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    padding: 14,
    ...theme.shadows.card,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  vehicleNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  route: {
    fontSize: 14,
    color: theme.colors.grey1,
    marginBottom: 4,
  },
  createdBy: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
    marginBottom: 6,
  },
  driverEmail: {
    fontSize: 12,
    color: theme.colors.grey2,
    flex: 1,
    marginRight: 8,
  },
  dateText: {
    fontSize: 12,
    color: theme.colors.grey2,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.separator,
    marginVertical: 8,
  },
  unstartedWarning: {
    fontSize: 12,
    color: '#d97706',
    fontWeight: '600',
  },
  skeleton: {
    backgroundColor: theme.colors.grey4,
    borderRadius: 6,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.grey1,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
  },
  retryText: {
    color: theme.colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.grey1,
  },
});
