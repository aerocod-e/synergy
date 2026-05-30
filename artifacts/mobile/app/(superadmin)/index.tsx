import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

export default function SuperAdminTrips() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('All');

  const fetchTrips = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else { setLoading(true); }
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

  const statusFilter = STATUS_FILTER_MAP[activeFilter];
  const filteredTrips = statusFilter
    ? trips.filter((t) => t.status === statusFilter)
    : trips;

  return (
    <View style={styles.container}>
      {/* Summary card */}
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

      {/* Filter pills */}
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

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.listContent}>
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
              {activeFilter !== 'All' && (
                <Text style={styles.emptySubText}>Try selecting a different filter</Text>
              )}
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(superadmin)/create-trip')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={theme.colors.white} />
      </TouchableOpacity>
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
  pillsContainer: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: theme.colors.primary,
  },
  pillInactive: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#e4e8ef',
  },
  pillText: {
    fontSize: 13,
  },
  pillTextActive: {
    color: theme.colors.white,
    fontWeight: '600',
  },
  pillTextInactive: {
    color: theme.colors.grey1,
  },
  listContent: {
    paddingBottom: 120,
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
  emptyList: {
    flex: 1,
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
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.strong,
  },
});
