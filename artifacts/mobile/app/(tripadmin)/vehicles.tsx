import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TextInput,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import VehicleSearchInput, { type Vehicle } from '@/components/VehicleSearchInput';
import { listVehicles, createVehicle, updateVehicle } from '@/services/api';
import { useLogout } from '@/hooks/useLogout';

interface VehicleWithCount extends Vehicle {
  tripCount: number;
}

export default function TripAdminVehicles() {
  const [vehicles, setVehicles] = useState<VehicleWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const PAGE_LIMIT = 20;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [editingVehicle, setEditingVehicle] = useState<VehicleWithCount | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editRegNumber, setEditRegNumber] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const navigation = useNavigation();
  const { handleLogout } = useLogout();

  const openEditVehicle = useCallback((vehicle: VehicleWithCount) => {
    setEditingVehicle(vehicle);
    setEditRegNumber(vehicle.registrationNumber);
    setEditError(null);
    setEditModalVisible(true);
  }, []);

  const handleEditVehicle = async () => {
    if (!editingVehicle) return;
    const trimmed = editRegNumber.trim().toUpperCase();
    if (!trimmed) {
      setEditError('Registration number cannot be empty.');
      return;
    }
    if (trimmed === editingVehicle.registrationNumber.toUpperCase()) {
      setEditingVehicle(null);
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateVehicle(editingVehicle.id, { registrationNumber: trimmed });
      setEditModalVisible(false);
      setEditingVehicle(null);
      fetchVehicles(true);
    } catch (err: any) {
      if (err?.error === 'ACTIVE_TRIP') {
        setEditError('This vehicle has active trips and cannot be edited.');
      } else if (err?.error === 'CONFLICT') {
        setEditError('A vehicle with this registration number already exists.');
      } else {
        setEditError(err?.message ?? 'Failed to update vehicle.');
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const openModal = useCallback(() => {
    setRegisterError(null);
    setModalVisible(true);
  }, []);

  // On web the floating FAB is intercepted by the tab navigator container,
  // so we surface the action via the header instead. On native the FAB renders normally.
  useEffect(() => {
    if (Platform.OS === 'web') {
      navigation.setOptions({
        headerRight: () => (
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={openModal}
              style={styles.headerBtn}
              accessibilityLabel="Register vehicle"
            >
              <Ionicons name="add-circle-outline" size={26} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.headerBtn}>
              <Ionicons name="log-out-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        ),
      });
    }
  }, [navigation, openModal, handleLogout]);

  const fetchVehicles = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setPage(1);
    try {
      const data = await listVehicles({ page: '1', limit: String(PAGE_LIMIT) });
      setVehicles((data as any).vehicles as VehicleWithCount[]);
      const pg = (data as any).pagination ?? {};
      setHasMore((pg.page ?? 1) < (pg.totalPages ?? 1));
      setFetchError(null);
    } catch {
      setFetchError("Couldn't load your vehicles");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await listVehicles({ page: String(nextPage), limit: String(PAGE_LIMIT) });
      setVehicles((prev) => [...prev, ...((data as any).vehicles as VehicleWithCount[])]);
      const pg = (data as any).pagination ?? {};
      setHasMore((pg.page ?? nextPage) < (pg.totalPages ?? nextPage));
      setPage(nextPage);
    } catch {
      // silent fail
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

  useFocusEffect(
    useCallback(() => {
      fetchVehicles();
    }, [fetchVehicles])
  );

  const handleRegisterNew = async (registrationNumber: string) => {
    if (!registrationNumber) return;
    setRegisterError(null);
    setRegistering(true);
    try {
      await createVehicle(registrationNumber);
      setModalVisible(false);
      fetchVehicles();
    } catch (err: any) {
      if (err?.error === 'CONFLICT') {
        setRegisterError('A vehicle with this registration number already exists.');
      } else {
        setRegisterError(err?.message ?? 'Failed to register vehicle.');
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleSelectExisting = (_vehicle: Vehicle) => {
    setModalVisible(false);
  };

  const renderVehicle = ({ item }: { item: VehicleWithCount }) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={styles.plateBadge}>
          <Text style={styles.plateText}>{item.registrationNumber}</Text>
        </View>
        <Text style={styles.tripCount}>
          {item.tripCount} {item.tripCount === 1 ? 'trip' : 'trips'}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => openEditVehicle(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Edit vehicle"
      >
        <Ionicons name="create-outline" size={22} color={theme.colors.primary} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (fetchError && vehicles.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.inactive} />
        <Text style={styles.fetchErrorTitle}>{fetchError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => fetchVehicles()}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={vehicles}
        keyExtractor={(v) => v.id}
        renderItem={renderVehicle}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchVehicles(true)}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="car-outline" size={48} color={theme.colors.inactive} />
            <Text style={styles.emptyTitle}>No vehicles yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to register your first vehicle</Text>
          </View>
        }
        ListFooterComponent={() => (
          <View>
            {hasMore && (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={loadMore}
                disabled={loadingMore}
                activeOpacity={0.7}
              >
                {loadingMore
                  ? <ActivityIndicator size="small" color={theme.colors.primary} />
                  : <Text style={styles.loadMoreText}>Load more</Text>
                }
              </TouchableOpacity>
            )}
            <View style={{ height: theme.PILL_NAV_BOTTOM_PADDING }} />
          </View>
        )}
      />

      {/* FAB — native only; on web the header + button is used instead */}
      {Platform.OS !== 'web' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openModal}
          activeOpacity={0.85}
          accessibilityLabel="Register vehicle"
        >
          <Ionicons name="add" size={28} color={theme.colors.white} />
        </TouchableOpacity>
      )}

      {/* ── Edit vehicle modal ──────────────────────────────────────────── */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Vehicle</Text>
            <TouchableOpacity
              onPress={() => setEditModalVisible(false)}
              accessibilityLabel="Close modal"
            >
              <Ionicons name="close" size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>REGISTRATION NUMBER</Text>
            <TextInput
              style={styles.textField}
              value={editRegNumber}
              onChangeText={setEditRegNumber}
              placeholder="e.g. LAG-001-XY"
              placeholderTextColor={theme.colors.grey1}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            {editError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
                <Text style={styles.errorText}>{editError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, editSubmitting && styles.submitButtonDisabled]}
              onPress={handleEditVehicle}
              activeOpacity={0.85}
              disabled={editSubmitting}
            >
              {editSubmitting ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Register vehicle modal ───────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Register Vehicle</Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              accessibilityLabel="Close modal"
            >
              <Ionicons name="close" size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>REGISTRATION NUMBER</Text>
            <VehicleSearchInput
              value=""
              onSelect={handleSelectExisting}
              onRegisterNew={handleRegisterNew}
              placeholder="e.g. LAG-001-XY"
            />

            {registerError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
                <Text style={styles.errorText}>{registerError}</Text>
              </View>
            )}

            {registering && (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={{ marginTop: 16 }}
              />
            )}
          </View>
        </View>
      </Modal>
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
  },
  listContent: {
    padding: 16,
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
  cardLeft: {
    flex: 1,
    gap: 6,
  },
  plateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.blueMuted,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  plateText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.blueText,
    letterSpacing: 1,
    flexShrink: 1,
  },
  tripCount: {
    fontSize: 13,
    color: theme.colors.grey1,
    fontWeight: '500',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 140,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  headerBtn: {
    padding: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: theme.colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.black,
  },
  modalBody: {
    padding: 20,
    gap: 8,
  },
  fieldLabel: {
    ...theme.typography.sectionLabel,
    marginBottom: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    flex: 1,
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
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.white,
  },
  loadMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.white,
    ...theme.shadows.card,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
});
