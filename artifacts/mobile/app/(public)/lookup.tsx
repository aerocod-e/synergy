import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { searchPublicTrips } from '@/services/api';

interface StakeholderStatus {
  stakeholderId: string;
  stakeholderName: string;
  status: 'paid' | 'pending';
}

interface TripPaymentStatus {
  loading: 'paid' | 'pending';
  unloading: 'paid' | 'pending';
  stakeholders: StakeholderStatus[];
}

interface TripResult {
  id: string;
  tripCode: string | null;
  vehicleNumber: string;
  status: string;
  loadingStateName: string;
  unloadingStateName: string;
  driverName: string | null;
  originDescription: string | null;
  destinationDescription: string | null;
  createdAt: string;
  paymentStatus: TripPaymentStatus;
}

const TRIP_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  created:    { bg: '#fef3c7', text: '#d97706' },
  in_transit: { bg: '#dbeafe', text: '#1a6ec8' },
  completed:  { bg: '#d1fae5', text: '#15803d' },
  cancelled:  { bg: '#fee2e2', text: '#dc2626' },
};

const STATUS_LABELS: Record<string, string> = {
  created:    'Created',
  in_transit: 'In Transit',
  completed:  'Completed',
  cancelled:  'Cancelled',
};

function PaymentBadge({ status }: { status: 'paid' | 'pending' }) {
  const isPaid = status === 'paid';
  return (
    <View style={[styles.payBadge, isPaid ? styles.payBadgePaid : styles.payBadgePending]}>
      <Text style={[styles.payBadgeText, isPaid ? styles.payBadgeTextPaid : styles.payBadgeTextPending]}>
        {isPaid ? 'Paid' : 'Pending'}
      </Text>
    </View>
  );
}

function TripCard({
  trip,
  expanded,
  onToggle,
}: {
  trip: TripResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusStyle = TRIP_STATUS_COLORS[trip.status] ?? TRIP_STATUS_COLORS.created!;
  const date = new Date(trip.createdAt).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  });

  return (
    <TouchableOpacity style={styles.card} onPress={onToggle} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <Text style={styles.tripCode}>{trip.tripCode ?? trip.id.slice(0, 8).toUpperCase()}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {STATUS_LABELS[trip.status] ?? trip.status}
          </Text>
        </View>
      </View>

      <View style={styles.infoRow}>
        <Ionicons name="navigate-outline" size={14} color={theme.colors.grey1} style={styles.infoIcon} />
        <Text style={styles.infoText}>{trip.loadingStateName} → {trip.unloadingStateName}</Text>
      </View>

      <View style={styles.infoRow}>
        <Ionicons name="car-outline" size={14} color={theme.colors.grey1} style={styles.infoIcon} />
        <Text style={styles.infoText}>{trip.vehicleNumber}</Text>
        {trip.driverName ? (
          <>
            <Text style={styles.dot}> · </Text>
            <Ionicons name="person-outline" size={14} color={theme.colors.grey1} style={styles.infoIcon} />
            <Text style={styles.infoText}>{trip.driverName}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.infoRow}>
        <Ionicons name="calendar-outline" size={14} color={theme.colors.grey1} style={styles.infoIcon} />
        <Text style={styles.infoText}>{date}</Text>
      </View>

      <View style={styles.expandRow}>
        <Text style={styles.expandLabel}>
          {expanded ? 'Hide payment details' : 'View payment details'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.colors.grey1}
        />
      </View>

      {expanded && (
        <View style={styles.paymentBreakdown}>
          <View style={styles.divider} />
          <Text style={styles.breakdownTitle}>Payment Verification</Text>

          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Loading Fee</Text>
            <PaymentBadge status={trip.paymentStatus.loading} />
          </View>

          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Unloading Fee</Text>
            <PaymentBadge status={trip.paymentStatus.unloading} />
          </View>

          {trip.paymentStatus.stakeholders.map((s) => (
            <View key={s.stakeholderId} style={styles.payRow}>
              <Text style={styles.payLabel}>{s.stakeholderName}</Text>
              <PaymentBadge status={s.status} />
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function LookupScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TripResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      setHasSearched(true);
      try {
        const data = await searchPublicTrips(query.trim());
        setResults((data as { trips: TripResult[] }).trips ?? []);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Lookup</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={theme.colors.grey1} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Trip ID, driver, vehicle, license, or location"
            placeholderTextColor={theme.colors.placeholder}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.grey1} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Searching…</Text>
        </View>
      ) : !hasSearched ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={56} color={theme.colors.inactive} />
          <Text style={styles.emptyTitle}>Verify trip payment status</Text>
          <Text style={styles.emptySubtitle}>
            Search by Trip ID, driver name, license number, phone number, vehicle plate, or location
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-outline" size={56} color={theme.colors.inactive} />
          <Text style={styles.emptyTitle}>No trips found</Text>
          <Text style={styles.emptySubtitle}>Try a different search term</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              expanded={expandedId === item.id}
              onToggle={() => handleToggle(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
    ...theme.shadows.header,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...theme.typography.headerTitle,
  },
  headerSpacer: {
    width: 38,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.white,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.black,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: theme.colors.grey1,
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.black,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.grey1,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...theme.shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tripCode: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoIcon: {
    marginRight: 6,
  },
  infoText: {
    fontSize: 13,
    color: theme.colors.grey2,
    flexShrink: 1,
  },
  dot: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginHorizontal: 2,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.separator,
  },
  expandLabel: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  paymentBreakdown: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.separator,
    marginBottom: 12,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.grey1,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  payLabel: {
    fontSize: 14,
    color: theme.colors.grey2,
    flex: 1,
    marginRight: 8,
  },
  payBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  payBadgePaid: {
    backgroundColor: theme.colors.greenMuted,
  },
  payBadgePending: {
    backgroundColor: '#fef3c7',
  },
  payBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  payBadgeTextPaid: {
    color: theme.colors.greenText,
  },
  payBadgeTextPending: {
    color: '#d97706',
  },
});
