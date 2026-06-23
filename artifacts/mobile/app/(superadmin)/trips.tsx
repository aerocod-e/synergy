import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { getTrips } from '@/services/api';

type TripStatus = 'created' | 'in_transit' | 'completed' | 'cancelled';

interface StateRef {
  id: string;
  name: string;
  code: string;
}

interface Trip {
  id: string;
  vehicleNumber: string;
  status: TripStatus;
  loadingState: StateRef;
  unloadingState: StateRef;
  driver: { id: string; email: string } | null;
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

/** Parse a YYYY-MM-DD string into a midnight Date, or null if invalid */
function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(trimmed + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={[styles.skeletonBlock, { width: 120, height: 17 }]} />
        <View style={[styles.skeletonBlock, { width: 72, height: 22, borderRadius: 8 }]} />
      </View>
      <View style={[styles.skeletonBlock, { width: '70%', height: 14, marginTop: 8 }]} />
      <View style={[styles.skeletonBlock, { width: '50%', height: 13, marginTop: 6 }]} />
    </View>
  );
}

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const badge = STATUS_BADGE[trip.status] ?? STATUS_BADGE.created;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardRow}>
        <Text style={styles.vehicleNumber}>{trip.vehicleNumber}</Text>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={styles.route} numberOfLines={1}>
        {trip.loadingState.name} → {trip.unloadingState.name}
      </Text>
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

export default function SuperAdminTripsList() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('All');

  // Search & date filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateFilters, setShowDateFilters] = useState(false);

  const fetchTrips = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const data = await getTrips();
      const list: Trip[] = Array.isArray(data?.trips) ? data.trips : [];
      setTrips(list);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const activeCount = trips.filter(
    (t) => t.status === 'created' || t.status === 'in_transit',
  ).length;
  const unstartedCount = trips.filter((t) => t.unstartedFlag === true).length;

  // Build filtered list
  const statusFilter = STATUS_FILTER_MAP[activeFilter];
  const fromDate = parseDate(dateFrom);
  const toDate = parseDate(dateTo);

  const filteredTrips = trips.filter((t) => {
    // Status filter
    if (statusFilter && t.status !== statusFilter) return false;

    // Search filter: vehicle number or driver email
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchVehicle = t.vehicleNumber.toLowerCase().includes(q);
      const matchDriver = (t.driver?.email ?? '').toLowerCase().includes(q);
      if (!matchVehicle && !matchDriver) return false;
    }

    // Date range filter
    if (fromDate || toDate) {
      const created = new Date(t.createdAt);
      if (fromDate && created < fromDate) return false;
      if (toDate) {
        // Include the entire "to" day
        const toEnd = new Date(toDate);
        toEnd.setHours(23, 59, 59, 999);
        if (created > toEnd) return false;
      }
    }

    return true;
  });

  // Count active extra filters (search + date from + date to)
  const extraFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);

  function clearAllFilters() {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setActiveFilter('All');
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryHalf}>
          <Text style={styles.summaryValue}>{activeCount}</Text>
          <Text style={styles.summaryLabel}>Active Trips</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryHalf}>
          <Text style={[styles.summaryValue, unstartedCount > 0 && styles.summaryValueAlert]}>
            {unstartedCount}
          </Text>
          <Text style={styles.summaryLabel}>Not Started</Text>
        </View>
      </View>

      <View style={styles.contentArea}>
        {/* Search bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search vehicle or driver email…"
              placeholderTextColor={theme.colors.grey1}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.dateToggleBtn, showDateFilters && styles.dateToggleBtnActive]}
            onPress={() => setShowDateFilters((v) => !v)}
            activeOpacity={0.75}
          >
            <Text style={[styles.dateToggleIcon, showDateFilters && styles.dateToggleIconActive]}>
              📅
            </Text>
            {(fromDate || toDate) && (
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>{(fromDate ? 1 : 0) + (toDate ? 1 : 0)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Date range filters (collapsible) */}
        {showDateFilters && (
          <View style={styles.dateRangeRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateFieldLabel}>From</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.grey1}
                value={dateFrom}
                onChangeText={setDateFrom}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                returnKeyType="next"
              />
            </View>
            <View style={styles.dateSeparatorLine} />
            <View style={styles.dateField}>
              <Text style={styles.dateFieldLabel}>To</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.grey1}
                value={dateTo}
                onChangeText={setDateTo}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                returnKeyType="done"
              />
            </View>
          </View>
        )}

        {/* Status pills + active filter badge */}
        <View style={styles.pillsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsContainer}
          >
            {FILTER_OPTIONS.map((f) => {
              const active = activeFilter === f;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setActiveFilter(f)}
                  activeOpacity={0.75}
                  style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                >
                  <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {extraFilterCount > 0 && (
            <TouchableOpacity style={styles.filterBadgeBtn} onPress={clearAllFilters} activeOpacity={0.75}>
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{extraFilterCount} filter{extraFilterCount > 1 ? 's' : ''} active</Text>
                <Text style={styles.filterBadgeClear}> ✕</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {loading && !refreshing ? (
          <View style={styles.skeletonArea}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : error ? (
          <View style={styles.centeredState}>
            <Text style={styles.errorText}>Failed to load trips</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => fetchTrips()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={filteredTrips}
            keyExtractor={(item) => item.id}
            contentContainerStyle={filteredTrips.length === 0 ? styles.emptyList : styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchTrips(true)} />
            }
            renderItem={({ item }) => (
              <TripCard
                trip={item}
                onPress={() => router.push(`/(superadmin)/trip-detail?id=${item.id}`)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.centeredState}>
                <Text style={styles.emptyIcon}>○</Text>
                <Text style={styles.emptyText}>No trips found</Text>
                {(activeFilter !== 'All' || extraFilterCount > 0) && (
                  <TouchableOpacity onPress={clearAllFilters} style={styles.clearFiltersBtn}>
                    <Text style={styles.clearFiltersText}>Clear all filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </View>
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
    marginHorizontal: 20,
    padding: 16,
    ...theme.shadows.card,
  },
  summaryHalf: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: theme.colors.separator,
    marginVertical: 4,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.black,
  },
  summaryValueAlert: {
    color: '#c8401a',
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.colors.grey1,
    marginTop: 2,
  },
  contentArea: {
    flex: 1,
  },
  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 10,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e8ef',
    paddingHorizontal: 12,
    height: 42,
    ...theme.shadows.card,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.black,
    paddingVertical: 0,
  },
  clearIcon: {
    fontSize: 14,
    color: theme.colors.grey1,
    paddingLeft: 6,
  },
  dateToggleBtn: {
    width: 42,
    height: 42,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e8ef',
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  dateToggleBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dateToggleIcon: {
    fontSize: 18,
  },
  dateToggleIconActive: {
    // emoji stays the same but button turns primary
  },
  dateBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#c8401a',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  dateBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  // Date range
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e8ef',
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...theme.shadows.card,
  },
  dateField: {
    flex: 1,
  },
  dateFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.grey1,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dateInput: {
    fontSize: 14,
    color: theme.colors.black,
    paddingVertical: 0,
  },
  dateSeparatorLine: {
    width: 1,
    height: 36,
    backgroundColor: theme.colors.separator,
    marginHorizontal: 12,
  },
  // Pills
  pillsWrapper: {
    paddingBottom: 4,
  },
  pillsContainer: {
    paddingHorizontal: 20,
    alignItems: 'center',
    paddingVertical: 6,
  },
  skeletonArea: {
    flex: 1,
    paddingTop: 8,
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
  // Active filter badge
  filterBadgeBtn: {
    alignSelf: 'flex-start',
    marginLeft: 20,
    marginBottom: 4,
  },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
  },
  filterBadgeClear: {
    fontSize: 11,
    color: '#b45309',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 140,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    marginHorizontal: 20,
    marginVertical: 6,
    padding: 16,
    ...theme.shadows.card,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.black,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  route: {
    fontSize: 14,
    color: theme.colors.grey2,
    marginTop: 6,
    marginBottom: 6,
  },
  driverEmail: {
    fontSize: 13,
    color: theme.colors.grey1,
    flex: 1,
    marginRight: 8,
  },
  dateText: {
    fontSize: 13,
    color: theme.colors.grey1,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.separator,
    marginTop: 10,
    marginBottom: 8,
  },
  unstartedWarning: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c8401a',
  },
  skeletonBlock: {
    backgroundColor: '#0d0d0d',
    opacity: 0.15,
    borderRadius: 6,
    height: 14,
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
  list: {
    flex: 1,
  },
  emptyList: {
    flexGrow: 1,
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
  clearFiltersBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
  },
  clearFiltersText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
