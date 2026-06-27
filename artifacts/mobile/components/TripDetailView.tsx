import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import { formatNaira } from '@/utils/formatCurrency';

export interface TripFee {
  id: string;
  recipientType: string;
  recipientId: string;
  feeType: string;
  amount: number;
  amountNaira: string;
}

export interface TripEvent {
  id: string;
  eventType: string;
  performedBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TripDetail {
  id: string;
  tripCode: string | null;
  vehicleNumber: string;
  vehicleTypeId?: string;
  vehicleTypeName?: string | null;
  status: string;
  loadingState: { id: string; name: string; code: string };
  unloadingState: { id: string; name: string; code: string };
  driver: { id: string; email: string } | null;
  originDescription: string | null;
  destinationDescription: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  fees: TripFee[];
  events: TripEvent[];
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  created:              { bg: '#e8f0fb', text: '#1a6ec8', label: 'Created' },
  in_transit:           { bg: '#fff8e1', text: '#f59e0b', label: 'In Transit' },
  completed:            { bg: '#e8f5ec', text: '#2a8a4a', label: 'Completed' },
  cancelled:            { bg: '#fdf0ed', text: '#c8401a', label: 'Cancelled' },
  cancellation_pending: { bg: '#fff4ed', text: '#ea580c', label: 'Pending Cancellation' },
};

const EVENT_LABELS: Record<string, string> = {
  created:                 'Trip Created',
  started:                 'Trip Started',
  completed:               'Trip Completed',
  cancelled:               'Trip Cancelled',
  cancellation_requested:  'Cancellation Requested',
  cancellation_rejected:   'Cancellation Rejected',
};

const FEE_LABELS: Record<string, string> = {
  loading:     'Loading Fee',
  unloading:   'Unloading Fee',
  stakeholder: 'Stakeholder Fee',
};

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

interface TripDetailViewProps {
  trip: TripDetail;
  footer?: React.ReactNode;
}

export default function TripDetailView({ trip, footer }: TripDetailViewProps) {
  const badge = STATUS_BADGE[trip.status] ?? { bg: '#e8f0fb', text: '#1a6ec8', label: trip.status };

  const loadingFees  = trip.fees.filter((f) => f.feeType === 'loading');
  const unloadingFees = trip.fees.filter((f) => f.feeType === 'unloading');
  const stakeholderFees = trip.fees.filter((f) => f.feeType === 'stakeholder' || f.feeType === 'stakeholder_fee');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerMeta}>TRIP ID</Text>
            <Text style={styles.tripCode}>{trip.tripCode ?? '—'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
        <View style={styles.rowDivider} />
        <View style={styles.vehicleRow}>
          <Text style={styles.headerMeta}>VEHICLE NO.</Text>
          <Text style={styles.vehicleNumber}>{trip.vehicleNumber}</Text>
          {trip.vehicleTypeName ? (
            <Text style={styles.vehicleType}>{trip.vehicleTypeName}</Text>
          ) : null}
        </View>
      </View>

      {/* ── Trip Info ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TRIP DETAILS</Text>
        <View style={styles.card}>
          <InfoRow label="Loading State"   value={trip.loadingState.name} />
          <View style={styles.rowDivider} />
          <InfoRow label="Unloading State" value={trip.unloadingState.name} />
          <View style={styles.rowDivider} />
          <InfoRow label="Driver"          value={trip.driver?.email ?? 'No driver assigned'} />
          <View style={styles.rowDivider} />
          <InfoRow label="Origin"          value={trip.originDescription ?? '—'} />
          <View style={styles.rowDivider} />
          <InfoRow label="Destination"     value={trip.destinationDescription ?? '—'} />
          <View style={styles.rowDivider} />
          <InfoRow label="Created by"      value={trip.createdByName ?? '—'} />
          <View style={styles.rowDivider} />
          <InfoRow label="Created"         value={formatDateShort(trip.createdAt)} />
        </View>
      </View>

      {/* ── Fees ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>FEES</Text>
        <View style={styles.card}>
          {trip.fees.length === 0 ? (
            <Text style={styles.emptyText}>No fees recorded</Text>
          ) : (
            <>
              {loadingFees.map((f, i) => (
                <View key={f.id}>
                  {i > 0 && <View style={styles.rowDivider} />}
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>{FEE_LABELS.loading}</Text>
                    <Text style={styles.feeAmount}>{formatNaira(f.amount)}</Text>
                  </View>
                </View>
              ))}
              {unloadingFees.map((f, i) => (
                <View key={f.id}>
                  {(i > 0 || loadingFees.length > 0) && <View style={styles.rowDivider} />}
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>{FEE_LABELS.unloading}</Text>
                    <Text style={styles.feeAmount}>{formatNaira(f.amount)}</Text>
                  </View>
                </View>
              ))}
              {stakeholderFees.map((f, idx) => (
                <View key={f.id}>
                  <View style={styles.rowDivider} />
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>{`Stakeholder Fee ${stakeholderFees.length > 1 ? idx + 1 : ''}`}</Text>
                    <Text style={styles.feeAmount}>{formatNaira(f.amount)}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </View>

      {/* ── Events Timeline ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TIMELINE</Text>
        {trip.events.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>No events yet</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {trip.events.map((ev, idx) => (
              <View key={ev.id} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={styles.timelineDot} />
                  {idx < trip.events.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.eventLabel}>
                    {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                  </Text>
                  {ev.performedBy && (
                    <Text style={styles.eventPerformer}>{ev.performedBy}</Text>
                  )}
                  <Text style={styles.eventTime}>{formatDateTime(ev.createdAt)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: theme.colors.white,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 16,
    padding: 16,
    ...theme.shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  headerMeta: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: theme.colors.grey1,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  vehicleRow: {
    marginTop: 10,
  },
  tripCode: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 0.5,
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
  vehicleNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.black,
    marginTop: 2,
  },
  vehicleType: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.grey1,
    marginTop: 4,
  },
  section: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: theme.colors.grey1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    ...theme.shadows.card,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: theme.colors.grey1,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
    flex: 1.5,
    textAlign: 'right',
  },
  rowDivider: {
    height: 1,
    backgroundColor: theme.colors.separator,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  feeLabel: {
    fontSize: 14,
    color: theme.colors.grey2,
  },
  feeAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.black,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.grey1,
    paddingVertical: 16,
    textAlign: 'center',
  },
  timeline: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#dbeafe',
    marginTop: 4,
    marginBottom: -4,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 12,
    marginLeft: 8,
    marginBottom: 8,
    ...theme.shadows.card,
  },
  eventLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.black,
  },
  eventPerformer: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginTop: 2,
  },
  eventTime: {
    fontSize: 12,
    color: theme.colors.grey1,
    marginTop: 4,
  },
});
