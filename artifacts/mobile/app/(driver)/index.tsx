import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '@/constants/theme';
import { getTrips, startTrip, completeTrip } from '@/services/api';

type TripStatus = 'created' | 'in_transit' | 'completed' | 'cancelled';

interface StateRef {
  id: string;
  name: string;
  code: string;
}

interface FeeInfo {
  status: string;
}

interface Trip {
  id: string;
  vehicleNumber: string;
  status: TripStatus;
  loadingState: StateRef;
  unloadingState: StateRef;
  originDescription?: string;
  destinationDescription?: string;
  loadingFee?: FeeInfo;
  unloadingFee?: FeeInfo;
  createdAt: string;
}

const STATUS_BADGE: Record<TripStatus, { bg: string; text: string; label: string }> = {
  created:    { bg: '#e8f0fb', text: '#1a6ec8', label: 'Created' },
  in_transit: { bg: '#fff8e1', text: '#f59e0b', label: 'In Transit' },
  completed:  { bg: '#e8f5ec', text: '#2a8a4a', label: 'Completed' },
  cancelled:  { bg: '#fdf0ed', text: '#c8401a', label: 'Cancelled' },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function StatusBadge({ status }: { status: TripStatus }) {
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.created;
  return (
    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
      <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
    </View>
  );
}

function PaidBadge({ label }: { label: string }) {
  return (
    <View style={styles.feeRow}>
      <Text style={styles.feeLabel}>{label}</Text>
      <View style={styles.paidBadge}>
        <Text style={styles.paidBadgeText}>PAID</Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function ActiveTripCard({ trip }: { trip: Trip }) {
  const routeStr = `${trip.loadingState?.name ?? '—'} → ${trip.unloadingState?.name ?? '—'}`;

  return (
    <View style={styles.activeTripCard}>
      {/* Section A: Header */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.activeLabelRow}>
          <Text style={styles.activeTripLabel}>ACTIVE TRIP</Text>
          <StatusBadge status={trip.status} />
        </View>
        <Text style={styles.vehicleNumber}>{trip.vehicleNumber}</Text>
        <Text style={styles.routeText}>{routeStr}</Text>
      </View>

      <Divider />

      {/* Section B: Fee Status */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionHeading}>Fee Status</Text>
        <PaidBadge label="Loading Fee" />
        <PaidBadge label="Unloading Fee" />
      </View>

      <Divider />

      {/* Section C: Trip Info */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionHeading}>Trip Info</Text>
        {trip.originDescription ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoRowLabel}>Origin</Text>
            <Text style={styles.infoRowValue} numberOfLines={2}>{trip.originDescription}</Text>
          </View>
        ) : null}
        {trip.destinationDescription ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoRowLabel}>Destination</Text>
            <Text style={styles.infoRowValue} numberOfLines={2}>{trip.destinationDescription}</Text>
          </View>
        ) : null}
        {!trip.originDescription && !trip.destinationDescription && (
          <Text style={styles.infoRowValue}>No additional info</Text>
        )}
      </View>
    </View>
  );
}

function HistoryCard({ trip }: { trip: Trip }) {
  const routeStr = `${trip.loadingState?.name ?? '—'} → ${trip.unloadingState?.name ?? '—'}`;
  return (
    <View style={styles.historyCard}>
      <View style={styles.historyCardRow}>
        <Text style={styles.historyVehicle}>{trip.vehicleNumber}</Text>
        <StatusBadge status={trip.status} />
      </View>
      <Text style={styles.historyRoute} numberOfLines={1}>{routeStr}</Text>
      <Text style={styles.historyDate}>{formatDate(trip.createdAt)}</Text>
    </View>
  );
}

function SkeletonBlock({ width, height, borderRadius = 6 }: { width: number | `${number}%`; height: number; borderRadius?: number }) {
  return <View style={[styles.skeletonBlock, { width: width as any, height, borderRadius }]} />;
}

function SkeletonScreen() {
  return (
    <View style={styles.skeletonWrapper}>
      <View style={styles.activeTripCard}>
        <View style={styles.cardHeaderRow}>
          <SkeletonBlock width={100} height={13} />
          <SkeletonBlock width={130} height={20} borderRadius={8} />
          <SkeletonBlock width={'80%'} height={14} />
        </View>
        <Divider />
        <View style={styles.cardSection}>
          <SkeletonBlock width={80} height={13} />
          <SkeletonBlock width={'60%'} height={13} />
          <SkeletonBlock width={'60%'} height={13} />
        </View>
        <Divider />
        <View style={styles.cardSection}>
          <SkeletonBlock width={70} height={13} />
          <SkeletonBlock width={'90%'} height={13} />
          <SkeletonBlock width={'75%'} height={13} />
        </View>
      </View>
    </View>
  );
}

export default function DriverDashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const activeTrip = trips.find(
    (t) => t.status === 'created' || t.status === 'in_transit',
  ) ?? null;

  const historyTrips = trips.filter(
    (t) => t.status === 'completed' || t.status === 'cancelled',
  );

  const handleStartTrip = () => {
    if (!activeTrip) return;
    Alert.alert(
      'Start Trip',
      'Are you sure you want to start this trip?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            setActionLoading(true);
            setActionError(null);
            try {
              await startTrip(activeTrip.id);
              await fetchTrips(true);
            } catch (err: any) {
              setActionError(err?.message ?? 'Failed to start trip. Please try again.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleCompleteTrip = () => {
    if (!activeTrip) return;
    Alert.alert(
      'Complete Trip',
      'Are you sure you want to mark this trip as complete?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            setActionLoading(true);
            setActionError(null);
            try {
              await completeTrip(activeTrip.id);
              await fetchTrips(true);
            } catch (err: any) {
              setActionError(err?.message ?? 'Failed to complete trip. Please try again.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  if (loading && !refreshing) {
    return <SkeletonScreen />;
  }

  if (error) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.errorText}>Failed to load trip data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchTrips()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const listData = historyTrips;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={listData}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => fetchTrips(true)} />
      }
      ListHeaderComponent={
        <View>
          {activeTrip ? (
            <>
              <ActiveTripCard trip={activeTrip} />

              {/* Action button */}
              {activeTrip.status === 'created' ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonBlue, actionLoading && styles.actionButtonDisabled]}
                  onPress={handleStartTrip}
                  disabled={actionLoading}
                  activeOpacity={0.85}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={theme.colors.white} />
                  ) : (
                    <Text style={styles.actionButtonText}>Start Trip</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonGreen, actionLoading && styles.actionButtonDisabled]}
                  onPress={handleCompleteTrip}
                  disabled={actionLoading}
                  activeOpacity={0.85}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={theme.colors.white} />
                  ) : (
                    <Text style={styles.actionButtonText}>Mark as Complete</Text>
                  )}
                </TouchableOpacity>
              )}

              {actionError ? (
                <Text style={styles.actionErrorText}>{actionError}</Text>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>○</Text>
              <Text style={styles.emptyTitle}>No Active Trip</Text>
              <Text style={styles.emptySubtitle}>You have no trip assigned right now</Text>
            </View>
          )}

          {/* History section header */}
          <Text style={styles.historySectionLabel}>Trip History</Text>
        </View>
      }
      renderItem={({ item }) => <HistoryCard trip={item} />}
      ListEmptyComponent={
        <Text style={styles.historyEmpty}>No completed trips yet</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    paddingBottom: 40,
  },
  skeletonWrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 20,
  },
  skeletonBlock: {
    backgroundColor: '#0d0d0d',
    opacity: 0.15,
    marginTop: 8,
  },

  // Active trip card
  activeTripCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 20,
    margin: 20,
    marginBottom: 12,
    ...theme.shadows.strong,
  },
  cardHeaderRow: {
    padding: 20,
    paddingBottom: 16,
  },
  activeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  activeTripLabel: {
    ...theme.typography.sectionLabel,
  },
  vehicleNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 4,
  },
  routeText: {
    fontSize: 14,
    color: theme.colors.grey2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.separator,
    marginHorizontal: 20,
  },
  cardSection: {
    padding: 20,
    paddingVertical: 16,
    gap: 8,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.grey1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feeLabel: {
    fontSize: 14,
    color: theme.colors.grey2,
  },
  paidBadge: {
    backgroundColor: theme.colors.greenMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  paidBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.greenText,
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  infoRowLabel: {
    fontSize: 13,
    color: theme.colors.grey1,
    width: 90,
    flexShrink: 0,
  },
  infoRowValue: {
    fontSize: 13,
    color: theme.colors.grey2,
    flex: 1,
  },

  // Status badge (shared)
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Action button
  actionButton: {
    marginHorizontal: 20,
    marginBottom: 4,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonBlue: {
    backgroundColor: '#1a6ec8',
  },
  actionButtonGreen: {
    backgroundColor: '#2a8a4a',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  actionErrorText: {
    color: theme.colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginHorizontal: 20,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingBottom: 40,
  },
  emptyIcon: {
    fontSize: 40,
    color: '#888888',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0d0d0d',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888888',
  },

  // History
  historySectionLabel: {
    ...theme.typography.sectionLabel,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  historyCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    marginHorizontal: 20,
    marginVertical: 5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...theme.shadows.card,
  },
  historyCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyVehicle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
  },
  historyRoute: {
    fontSize: 13,
    color: theme.colors.grey2,
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: theme.colors.grey1,
    textAlign: 'right',
  },
  historyEmpty: {
    fontSize: 13,
    color: theme.colors.grey1,
    textAlign: 'center',
    marginTop: 8,
  },

  // Error / centered state
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
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
});
