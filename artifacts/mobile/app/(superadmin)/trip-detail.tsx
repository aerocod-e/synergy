import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { getTripById } from '@/services/api';
import TripDetailView, { type TripDetail } from '@/components/TripDetailView';

export default function SuperAdminTripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.inactive} />
        <Text style={styles.errorText}>Failed to load trip</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchTrip}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <TripDetailView trip={trip} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: theme.colors.background,
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
