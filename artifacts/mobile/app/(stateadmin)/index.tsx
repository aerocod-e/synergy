import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import {
  listCancellationRequests,
  approveCancellationRequest,
  rejectCancellationRequest,
} from '@/services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CancellationRequest {
  id: string;
  tripId: string;
  reason: string;
  status: string;
  previousTripStatus: string;
  createdAt: string;
  vehicleNumber: string;
  driverName: string | null;
  loadingState: string;
  unloadingState: string;
  requestedByEmail: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function StateAdminHome() {
  const router = useRouter();
  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // reject modal state
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // approve in-progress tracker
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // ── fetch ─────────────────────────────────────────────────────────────────

  const fetchRequests = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await listCancellationRequests();
      setRequests((data as any) as CancellationRequest[]);
      setFetchError(null);
    } catch {
      setFetchError("Couldn't load cancellation requests");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [fetchRequests])
  );

  // ── approve ───────────────────────────────────────────────────────────────

  const handleApprove = useCallback(async (id: string) => {
    setApprovingId(id);
    try {
      await approveCancellationRequest(id);
      fetchRequests(true);
    } catch (err: any) {
      setFetchError(err?.message ?? 'Failed to approve request');
    } finally {
      setApprovingId(null);
    }
  }, [fetchRequests]);

  // ── reject ────────────────────────────────────────────────────────────────

  const openRejectModal = (id: string) => {
    setRejectModalId(id);
    setRejectReason('');
    setRejectError(null);
  };

  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      setRejectError('Please provide a rejection reason.');
      return;
    }
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      await rejectCancellationRequest(rejectModalId!, rejectReason.trim());
      setRejectModalId(null);
      setRejectReason('');
      fetchRequests(true);
    } catch (err: any) {
      setRejectError(err?.message ?? 'Failed to reject request');
    } finally {
      setRejectSubmitting(false);
    }
  }, [rejectModalId, rejectReason, fetchRequests]);

  // ── render item ───────────────────────────────────────────────────────────

  const renderRequest = ({ item }: { item: CancellationRequest }) => {
    const isApproving = approvingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.plateBadge}>
            <Text style={styles.plateText}>{item.vehicleNumber}</Text>
          </View>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>Pending Cancel</Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="location-outline" size={14} color={theme.colors.grey1} />
          <Text style={styles.cardRowText} numberOfLines={1}>
            {item.loadingState} → {item.unloadingState}
          </Text>
        </View>

        {item.driverName && (
          <View style={styles.cardRow}>
            <Ionicons name="person-outline" size={14} color={theme.colors.grey1} />
            <Text style={styles.cardRowText} numberOfLines={1}>{item.driverName}</Text>
          </View>
        )}

        <View style={styles.cardRow}>
          <Ionicons name="mail-outline" size={14} color={theme.colors.grey1} />
          <Text style={styles.cardRowText} numberOfLines={1}>{item.requestedByEmail}</Text>
        </View>

        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>REASON</Text>
          <Text style={styles.reasonText}>{item.reason}</Text>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.rejectBtn, isApproving && styles.btnDisabled]}
            onPress={() => openRejectModal(item.id)}
            activeOpacity={0.7}
            disabled={isApproving}
          >
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approveBtn, isApproving && styles.btnDisabled]}
            onPress={() => handleApprove(item.id)}
            activeOpacity={0.85}
            disabled={isApproving}
          >
            {isApproving ? (
              <ActivityIndicator size="small" color={theme.colors.white} />
            ) : (
              <Text style={styles.approveBtnText}>Approve</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (fetchError && requests.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.inactive} />
        <Text style={styles.fetchErrorTitle}>{fetchError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => fetchRequests()}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── main ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <FlatList
        data={requests}
        keyExtractor={(r) => r.id}
        renderItem={renderRequest}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchRequests(true)}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <Text style={styles.listHeaderTitle}>Cancellation Requests</Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={52} color={theme.colors.inactive} />
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptySubtitle}>No pending cancellation requests</Text>
          </View>
        }
        ListFooterComponent={() => (
          <>
            <TouchableOpacity
              style={styles.verifyRow}
              onPress={() => router.push('/(public)/lookup')}
              activeOpacity={0.7}
            >
              <Ionicons name="search-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.verifyRowText}>Public Lookup</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.grey1} />
            </TouchableOpacity>
            <View style={{ height: theme.PILL_NAV_BOTTOM_PADDING }} />
          </>
        )}
      />

      {/* ── Reject modal ── */}
      <Modal
        visible={rejectModalId !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setRejectModalId(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.rejectSheet}>
            <Text style={styles.rejectSheetTitle}>Reject Request</Text>
            <Text style={styles.rejectSheetSubtitle}>
              Provide a reason so the Trip Admin knows why this was rejected.
            </Text>
            <TextInput
              style={[styles.textField, styles.rejectReasonInput]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Enter rejection reason…"
              placeholderTextColor={theme.colors.grey1}
              multiline
              numberOfLines={3}
              autoCorrect={false}
            />
            {rejectError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
                <Text style={styles.errorText}>{rejectError}</Text>
              </View>
            )}
            <View style={styles.rejectSheetActions}>
              <TouchableOpacity
                style={styles.dismissBtn}
                onPress={() => setRejectModalId(null)}
                activeOpacity={0.7}
                disabled={rejectSubmitting}
              >
                <Text style={styles.dismissBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectConfirmBtn, rejectSubmitting && styles.btnDisabled]}
                onPress={handleReject}
                activeOpacity={0.85}
                disabled={rejectSubmitting}
              >
                {rejectSubmitting ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.rejectConfirmBtnText}>Confirm Rejection</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
    gap: 12,
  },
  listContent: {
    padding: 16,
  },
  listHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 16,
  },

  // card
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 10,
    ...theme.shadows.card,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plateBadge: {
    backgroundColor: theme.colors.blueMuted,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  plateText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.blueText,
    letterSpacing: 1,
  },
  pendingBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fff4ed',
  },
  pendingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ea580c',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardRowText: {
    fontSize: 13,
    color: theme.colors.grey2,
    fontWeight: '500',
    flex: 1,
  },
  reasonBox: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.grey1,
    letterSpacing: 0.8,
  },
  reasonText: {
    fontSize: 14,
    color: theme.colors.black,
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  rejectBtn: {
    flex: 1,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.error,
  },
  rejectBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.error,
  },
  approveBtn: {
    flex: 2,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
  },
  approveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.white,
  },
  btnDisabled: {
    opacity: 0.5,
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
  fetchErrorTitle: {
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

  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    ...theme.shadows.card,
  },
  verifyRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
  },

  // reject modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  rejectSheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 12,
  },
  rejectSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.black,
  },
  rejectSheetSubtitle: {
    fontSize: 14,
    color: theme.colors.grey1,
    lineHeight: 20,
  },
  textField: {
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 15,
    color: theme.colors.black,
  },
  rejectReasonInput: {
    height: 88,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    flex: 1,
  },
  rejectSheetActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  dismissBtn: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
  },
  dismissBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  rejectConfirmBtn: {
    flex: 2,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: theme.colors.error,
  },
  rejectConfirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.white,
  },
});
