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
  ScrollView,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { AlertCircle, BarChart2, Car, Check, ChevronDown, ChevronUp, CloudOff, LogOut, Pencil, Plus, PlusCircle, Trash2, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import ScreenTransition from '@/components/ScreenTransition';
import SlideUpList from '@/components/SlideUpList';
import VehicleSearchInput, { type Vehicle } from '@/components/VehicleSearchInput';
import { listVehicles, createVehicle, updateVehicle, deleteVehicle as deleteVehicleApi, listVehicleTypes, getActivePricingChart } from '@/services/api';
import { useLogout } from '@/hooks/useLogout';
import { formatNaira } from '@/utils/formatCurrency';
import { confirmAction } from '@/utils/confirmAction';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface VehicleType {
  id: string;
  name: string;
}

interface VehicleTypeStakeholderRate {
  stakeholderId: string;
  stakeholderName: string;
  amount: number;
}

interface VehicleTypeRate {
  vehicleTypeId: string;
  vehicleTypeName: string;
  loadingFee: number;
  unloadingFee: number;
  stakeholderRates: VehicleTypeStakeholderRate[];
}

interface PricingChart {
  id: string;
  isActive: boolean;
  vehicleTypeRates: VehicleTypeRate[];
}

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
  const [editTypeId, setEditTypeId] = useState<string>('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});

  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [pendingRegNum, setPendingRegNum] = useState<string | null>(null);
  const [pendingVehicleTypeId, setPendingVehicleTypeId] = useState<string>('');
  const [activeChart, setActiveChart] = useState<PricingChart | null>(null);
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);

  const navigation = useNavigation();
  const router     = useRouter();
  const { handleLogout } = useLogout();

  const [auditModalVisible, setAuditModalVisible] = useState(false);
  const [auditMode, setAuditMode]                 = useState<'choice' | 'select'>('choice');
  const [auditVehicleSearch, setAuditVehicleSearch] = useState('');

  useEffect(() => {
    listVehicleTypes()
      .then((data: any) => setVehicleTypes(data?.vehicleTypes ?? []))
      .catch(() => {});
    getActivePricingChart()
      .then((data: any) => setActiveChart(data?.chart ?? null))
      .catch(() => {});
  }, []);

  const openEditVehicle = useCallback((vehicle: VehicleWithCount) => {
    setEditingVehicle(vehicle);
    setEditRegNumber(vehicle.registrationNumber);
    setEditTypeId((vehicle as any).vehicleTypeId ?? '');
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
    const regChanged = trimmed !== editingVehicle.registrationNumber.toUpperCase();
    const typeChanged = editTypeId !== ((editingVehicle as any).vehicleTypeId ?? '');
    if (!regChanged && !typeChanged) {
      setEditModalVisible(false);
      setEditingVehicle(null);
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateVehicle(editingVehicle.id, {
        registrationNumber: trimmed,
        ...(typeChanged && editTypeId ? { vehicleTypeId: editTypeId } : {}),
      });
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
    setPendingRegNum(null);
    setPendingVehicleTypeId('');
    setModalVisible(true);
  }, []);

  const openAuditPicker = useCallback(() => {
    setAuditMode('choice');
    setAuditVehicleSearch('');
    setAuditModalVisible(true);
  }, []);

  const goAuditAll = () => {
    setAuditModalVisible(false);
    router.push('/(tripadmin)/audit-report');
  };

  const goAuditVehicle = (v: VehicleWithCount) => {
    setAuditModalVisible(false);
    router.push(`/(tripadmin)/audit-report?vehicleId=${v.id}&vehicleReg=${encodeURIComponent(v.registrationNumber)}`);
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      navigation.setOptions({
        headerRight: () => (
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={openAuditPicker}
              style={styles.headerBtn}
              accessibilityLabel="Generate audit"
            >
              <BarChart2 size={24} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openModal}
              style={styles.headerBtn}
              accessibilityLabel="Register vehicle"
            >
              <PlusCircle size={26} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.headerBtn}>
              <LogOut size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        ),
      });
    }
  }, [navigation, openModal, openAuditPicker, handleLogout]);

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
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

  useFocusEffect(
    useCallback(() => {
      fetchVehicles();
    }, [fetchVehicles])
  );

  const handleRegisterNew = (registrationNumber: string) => {
    if (!registrationNumber) return;
    setRegisterError(null);
    setPendingVehicleTypeId('');
    setPendingRegNum(registrationNumber);
  };

  const handleConfirmRegister = async () => {
    if (!pendingRegNum || !pendingVehicleTypeId) {
      setRegisterError('Please select a vehicle type.');
      return;
    }
    setRegisterError(null);
    setRegistering(true);
    try {
      await createVehicle({ registrationNumber: pendingRegNum, vehicleTypeId: pendingVehicleTypeId });
      setModalVisible(false);
      setPendingRegNum(null);
      setPendingVehicleTypeId('');
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

  const handleDeleteVehicle = useCallback((item: VehicleWithCount) => {
    confirmAction({
      title: `Remove ${item.registrationNumber}?`,
      message: 'This cannot be undone. Vehicles with active trips cannot be removed.',
      confirmText: 'Remove',
      destructive: true,
      onConfirm: async () => {
        setDeleting((prev) => ({ ...prev, [item.id]: true }));
        setDeleteError((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        try {
          await deleteVehicleApi(item.id);
          setVehicles((prev) => prev.filter((v) => v.id !== item.id));
        } catch (err: any) {
          setDeleteError((prev) => ({
            ...prev,
            [item.id]: err?.message ?? 'Failed to remove vehicle.',
          }));
        } finally {
          setDeleting((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        }
      },
    });
  }, []);

  const renderVehicle = ({ item }: { item: VehicleWithCount }) => (
    <View style={styles.card}>
      <View style={styles.cardMain}>
        <View style={styles.cardLeft}>
          <View style={styles.plateBadge}>
            <Text style={styles.plateText}>{item.registrationNumber}</Text>
          </View>
          {item.vehicleTypeName ? (
            <Text style={styles.vehicleTypeName}>{item.vehicleTypeName}</Text>
          ) : null}
          <Text style={styles.tripCount}>
            {item.tripCount} {item.tripCount === 1 ? 'trip' : 'trips'}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={() => openEditVehicle(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Edit vehicle"
          >
            <Pencil size={22} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDeleteVehicle(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={!!deleting[item.id]}
            accessibilityLabel="Remove vehicle"
          >
            {deleting[item.id]
              ? <ActivityIndicator size="small" color={theme.colors.error} />
              : <Trash2 size={22} color={theme.colors.error} />
            }
          </TouchableOpacity>
        </View>
      </View>
      {deleteError[item.id] ? (
        <View style={styles.cardError}>
          <AlertCircle size={13} color={theme.colors.error} />
          <Text style={styles.cardErrorText}>{deleteError[item.id]}</Text>
        </View>
      ) : null}
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
        <CloudOff size={48} color={theme.colors.inactive} />
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
      <TopBar />
      <ScreenTransition style={{ flex: 1 }}>
      <SlideUpList style={{ flex: 1 }}>
      <FlatList
        data={vehicles}
        keyExtractor={(v) => v.id}
        renderItem={renderVehicle}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeaderRow}>
            <Text style={styles.listHeaderTitle}>Vehicles</Text>
            <TouchableOpacity
              style={styles.auditBannerBtn}
              onPress={openAuditPicker}
              activeOpacity={0.8}
            >
              <BarChart2 size={16} color={theme.colors.primary} />
              <Text style={styles.auditBannerText}>Audit Report</Text>
            </TouchableOpacity>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchVehicles(true)}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Car size={48} color={theme.colors.inactive} />
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
      </SlideUpList>

      {Platform.OS !== 'web' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openModal}
          activeOpacity={0.85}
          accessibilityLabel="Register vehicle"
        >
          <Plus size={28} color={theme.colors.white} />
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
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
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

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>VEHICLE TYPE</Text>
            {vehicleTypes.length === 0 ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 12 }} />
            ) : (
              vehicleTypes.map((vt) => {
                const selected = vt.id === editTypeId;
                return (
                  <TouchableOpacity
                    key={vt.id}
                    style={[styles.typeRow, selected && styles.typeRowSelected]}
                    onPress={() => setEditTypeId(vt.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.typeRowText, selected && styles.typeRowTextSelected]}>
                      {vt.name}
                    </Text>
                    {selected && <Check size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })
            )}

            {editError && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color={theme.colors.error} />
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
          </ScrollView>
        </View>
      </Modal>

      {/* ── Register vehicle modal ───────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setModalVisible(false); setPendingRegNum(null); }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Register Vehicle</Text>
            <TouchableOpacity
              onPress={() => { setModalVisible(false); setPendingRegNum(null); }}
              accessibilityLabel="Close modal"
            >
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {pendingRegNum === null ? (
              <>
                <Text style={styles.fieldLabel}>REGISTRATION NUMBER</Text>
                <VehicleSearchInput
                  value=""
                  onSelect={handleSelectExisting}
                  onRegisterNew={handleRegisterNew}
                  placeholder="e.g. LAG-001-XY"
                />
              </>
            ) : (
              <>
                <View style={styles.pendingRegRow}>
                  <View style={styles.plateBadgeSmall}>
                    <Text style={styles.plateTextSmall}>{pendingRegNum}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setPendingRegNum(null); setPendingVehicleTypeId(''); setRegisterError(null); }} style={styles.changeBtn}>
                    <Text style={styles.changeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>SELECT VEHICLE TYPE</Text>
                {vehicleTypes.length === 0 ? (
                  <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 12 }} />
                ) : (
                  vehicleTypes.map((vt) => {
                    const selected = vt.id === pendingVehicleTypeId;
                    const expanded = vt.id === expandedTypeId;
                    const rate = activeChart?.vehicleTypeRates.find((r) => r.vehicleTypeId === vt.id) ?? null;
                    return (
                      <View key={vt.id} style={styles.typeRowWrapper}>
                        <TouchableOpacity
                          style={[styles.typeRow, selected && styles.typeRowSelected]}
                          onPress={() => {
                            setPendingVehicleTypeId(vt.id);
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setExpandedTypeId(expanded ? null : vt.id);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.typeRowText, selected && styles.typeRowTextSelected]}>
                            {vt.name}
                          </Text>
                          <View style={styles.typeRowRight}>
                            {selected && <Check size={18} color={theme.colors.primary} />}
                            {expanded
                              ? <ChevronUp size={16} color={theme.colors.grey1} />
                              : <ChevronDown size={16} color={theme.colors.grey1} />}
                          </View>
                        </TouchableOpacity>
                        {expanded && (
                          <View style={styles.typeRateBody}>
                            {rate ? (
                              <>
                                <View style={styles.feeRow}>
                                  <Text style={styles.feeLabel}>Loading Fee</Text>
                                  <Text style={styles.feeValue}>{formatNaira(rate.loadingFee)}</Text>
                                </View>
                                <View style={styles.feeRow}>
                                  <Text style={styles.feeLabel}>Unloading Fee</Text>
                                  <Text style={styles.feeValue}>{formatNaira(rate.unloadingFee)}</Text>
                                </View>
                                {rate.stakeholderRates.length > 0 && (
                                  <>
                                    <View style={styles.divider} />
                                    <Text style={styles.subLabel}>STAKEHOLDER RATES</Text>
                                    {rate.stakeholderRates.map((sr) => (
                                      <View key={sr.stakeholderId} style={styles.feeRow}>
                                        <Text style={styles.feeLabel}>{sr.stakeholderName}</Text>
                                        <Text style={styles.feeValue}>{formatNaira(sr.amount)}</Text>
                                      </View>
                                    ))}
                                  </>
                                )}
                              </>
                            ) : (
                              <Text style={styles.emptyRatesText}>Rate not yet configured for this vehicle type.</Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </>
            )}

            {registerError && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color={theme.colors.error} />
                <Text style={styles.errorText}>{registerError}</Text>
              </View>
            )}

            {pendingRegNum !== null && (
              <TouchableOpacity
                style={[styles.submitButton, (registering || !pendingVehicleTypeId) && styles.submitButtonDisabled]}
                onPress={handleConfirmRegister}
                activeOpacity={0.85}
                disabled={registering || !pendingVehicleTypeId}
              >
                {registering ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Register Vehicle</Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
      {/* ── Audit picker modal ───────────────────────────────────────────── */}
      <Modal
        visible={auditModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAuditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {auditMode === 'select' ? 'Select Vehicle' : 'Generate Audit'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (auditMode === 'select') { setAuditMode('choice'); setAuditVehicleSearch(''); }
                else { setAuditModalVisible(false); }
              }}
            >
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          {auditMode === 'choice' ? (
            <View style={styles.auditChoiceBody}>
              <TouchableOpacity style={styles.auditChoiceBtn} onPress={goAuditAll} activeOpacity={0.8}>
                <BarChart2 size={22} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditChoiceTitle}>All Vehicles</Text>
                  <Text style={styles.auditChoiceSub}>Combined report across all your vehicles</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.auditChoiceBtn}
                onPress={() => { setAuditMode('select'); setAuditVehicleSearch(''); }}
                activeOpacity={0.8}
              >
                <Car size={22} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditChoiceTitle}>Select a Vehicle</Text>
                  <Text style={styles.auditChoiceSub}>Report for one specific vehicle</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={styles.auditSearchRow}>
                <TextInput
                  style={styles.auditSearchInput}
                  value={auditVehicleSearch}
                  onChangeText={setAuditVehicleSearch}
                  placeholder="Search by registration…"
                  placeholderTextColor={theme.colors.placeholder}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
                {vehicles
                  .filter((v) =>
                    !auditVehicleSearch.trim() ||
                    v.registrationNumber.toUpperCase().includes(auditVehicleSearch.toUpperCase()),
                  )
                  .map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      style={styles.auditVehicleRow}
                      onPress={() => goAuditVehicle(v)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.plateBadgeSmall}>
                        <Text style={styles.plateTextSmall}>{v.registrationNumber}</Text>
                      </View>
                      {v.vehicleTypeName ? (
                        <Text style={styles.vehicleTypeName}>{v.vehicleTypeName}</Text>
                      ) : null}
                      <Text style={styles.auditVehicleTripCount}>
                        {v.tripCount} {v.tripCount === 1 ? 'trip' : 'trips'}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
      </ScreenTransition>
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
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 10,
    ...theme.shadows.card,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
    gap: 4,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginLeft: 12,
  },
  cardError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardErrorText: {
    fontSize: 12,
    color: theme.colors.error,
    flex: 1,
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
  vehicleTypeName: {
    fontSize: 13,
    color: theme.colors.grey1,
    fontWeight: '500',
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
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  listHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.black,
  },
  auditBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: theme.colors.blueMuted,
  },
  auditBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  auditChoiceBody: {
    padding: 20,
    gap: 12,
  },
  auditChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    ...theme.shadows.card,
  },
  auditChoiceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 2,
  },
  auditChoiceSub: {
    fontSize: 13,
    color: theme.colors.grey1,
  },
  auditSearchRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  auditSearchInput: {
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 14,
    color: theme.colors.black,
  },
  auditVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  auditVehicleTripCount: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginLeft: 'auto',
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
  pendingRegRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  plateBadgeSmall: {
    backgroundColor: theme.colors.blueMuted,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  plateTextSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.blueText,
    letterSpacing: 1,
  },
  changeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.grey3,
  },
  changeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  typeRowWrapper: {
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    backgroundColor: theme.colors.white,
    overflow: 'hidden',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  typeRowSelected: {
    backgroundColor: theme.colors.blueMuted,
  },
  typeRowText: {
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '500',
  },
  typeRowTextSelected: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  typeRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeRateBody: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 2,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  feeLabel: {
    fontSize: 14,
    color: theme.colors.grey2,
    flex: 1,
  },
  feeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.black,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.separator,
    marginVertical: 4,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: theme.colors.grey1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  emptyRatesText: {
    fontSize: 14,
    color: theme.colors.grey1,
    paddingVertical: 4,
  },
});
