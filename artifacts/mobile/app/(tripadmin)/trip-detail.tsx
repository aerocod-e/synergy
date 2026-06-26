import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { getTripById } from '@/services/api';
import TripDetailView, { type TripDetail } from '@/components/TripDetailView';

export default function TripAdminTripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchTrip = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const data = await getTripById(id);
      setTrip(data.trip as TripDetail);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <ChevronLeft size={24} color={theme.colors.primary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Trip Details</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centered}>
          <AlertCircle size={48} color={theme.colors.inactive} />
          <Text style={styles.errorText}>Failed to load trip</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchTrip}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const verifyFooter = trip.tripCode ? (
    <TouchableOpacity
      style={styles.verifyRow}
      onPress={() => router.push(`/(public)/lookup?q=${encodeURIComponent(trip.tripCode!)}`)}
      activeOpacity={0.7}
    >
      <Search size={18} color={theme.colors.primary} />
      <Text style={styles.verifyRowText}>Verify this trip's payment status</Text>
      <ChevronRight size={16} color={theme.colors.grey1} />
    </TouchableOpacity>
  ) : undefined;

  return (
    <View style={styles.root}>
      {header}
      <TripDetailView trip={trip} footer={verifyFooter} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.black,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerSpacer: {
    width: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  verifyRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
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
  retryButtonText: {
    color: theme.colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
});
