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
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { AlertCircle, AlertTriangle, Car, Check, ChevronDown, ChevronUp, CloudOff, LogOut, MapPin, Plus, PlusCircle, User, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import ScreenTransition from '@/components/ScreenTransition';
import SlideUpList from '@/components/SlideUpList';
import VehicleSearchInput, { type Vehicle } from '@/components/VehicleSearchInput';
import DriverSearchInput, { type Driver } from '@/components/DriverSearchInput';
import { getTrips, createTrip, getActivePricingChart, getStates, requestCancellation, createVehicle, listVehicleTypes } from '@/services/api';
import { formatNaira } from '@/utils/formatCurrency';
import { useLogout } from '@/hooks/useLogout';
import { useAuthContext } from '@/app/_layout';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TripItem {
  id: string;
  vehicleNumber: string;
  vehicleTypeName?: string | null;
  status: 'created' | 'in_transit' | 'completed' | 'cancelled' | 'cancellation_pending' | string;
  loadingState: { id: string; name: string; code: string };
  unloadingState: { id: string; name: string; code: string };
  driver: { id: string; email: string } | null;
  originDescription: string | null;
  destinationDescription: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  createdAt: string;
}

interface StakeholderRateItem {
  stakeholderId: string;
  stakeholderName: string;
  amount: number;
}

interface VehicleTypeRate {
  vehicleTypeId: string;
  vehicleTypeName: string;
  loadingFee: number;
  unloadingFee: number;
  stakeholderRates: StakeholderRateItem[];
}

interface PricingData {
  vehicleTypeRates: VehicleTypeRate[];
}

interface StateItem {
  id: string;
  name: string;
  code: string;
}

interface VehicleTypeItem {
  id: string;
  name: string;
}

// ── Status badge helpers ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  created:               'Created',
  in_transit:            'In Transit',
  completed:             'Completed',
  cancelled:             'Cancelled',
  cancellation_pending:  'Pending Cancel',
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  created:               { bg: theme.colors.blueMuted,  text: theme.colors.blueText },
  in_transit:            { bg: '#fef3c7',               text: '#d97706' },
  completed:             { bg: theme.colors.greenMuted, text: theme.colors.greenText },
  cancelled:             { bg: theme.colors.grey3,      text: theme.colors.grey1 },
  cancellation_pending:  { bg: '#fff4ed',               text: '#ea580c' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TripAdminTrips() {
  const navigation = useNavigation();
  const router = useRouter();
  const { handleLogout } = useLogout();
  const { user } = useAuthContext();

  // trips list
  const PAGE_LIMIT = 20;
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // form modal
  const [modalVisible, setModalVisible] = useState(false);

  // form — pricing & states (loaded when modal opens)
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [states, setStates] = useState<StateItem[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeItem[]>([]);
  const [formLoading, setFormLoading] = useState(false);

  // form inputs
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleInputValue, setVehicleInputValue] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [driverInputValue, setDriverInputValue] = useState('');
  const [loadingStateId, setLoadingStateId] = useState('');
  const [unloadingStateId, setUnloadingStateId] = useState('');
  const [originDescription, setOriginDescription] = useState('');
  const [destinationDescription, setDestinationDescription] = useState('');

  // inline state picker (unloading only)
  const [activeStatePicker, setActiveStatePicker] = useState<'unloading' | null>(null);

  // vehicle inline registration (type picker step)
  const [vehicleRegistering, setVehicleRegistering] = useState(false);
  const [vehicleRegisterError, setVehicleRegisterError] = useState<string | null>(null);
  const [pendingRegNum, setPendingRegNum] = useState<string | null>(null);
  const [pendingRegTypeId, setPendingRegTypeId] = useState<string>('');

  // submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // cancellation request modal
  const [cancelModalTripId, setCancelModalTripId] = useState<string | null>(null);
  const [cancelModalTripStatus, setCancelModalTripStatus] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // ── trips fetch ─────────────────────────────────────────────────────────────

  const fetchTrips = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setPage(1);
    try {
      const data = await getTrips({ page: '1', limit: String(PAGE_LIMIT) });
      setTrips((data as any).trips as TripItem[]);
      const pg = (data as any).pagination ?? {};
      setHasMore((pg.page ?? 1) < (pg.totalPages ?? 1));
      setFetchError(null);
    } catch {
      setFetchError("Couldn't load your trips");
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
      const data = await getTrips({ page: String(nextPage), limit: String(PAGE_LIMIT) });
      setTrips((prev) => [...prev, ...((data as any).trips as TripItem[])]);
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
      fetchTrips();
    }, [fetchTrips])
  );

  // ── form open/close ─────────────────────────────────────────────────────────

  const loadFormData = useCallback(async () => {
    setFormLoading(true);
    setPricingError(null);
    setPricing(null);
    setStates([]);
    setVehicleTypes([]);
    try {
      const [pricingRes, statesRes, vehicleTypesRes] = await Promise.all([
        getActivePricingChart().catch(() => null),
        getStates().catch(() => []),
        listVehicleTypes().catch(() => null),
      ]);

      if (!pricingRes) {
        setPricingError('No active pricing chart. Contact your administrator before creating a trip.');
      } else {
        const chart = (pricingRes as any).chart;
        const pd: PricingData = {
          vehicleTypeRates: (chart.vehicleTypeRates ?? []) as VehicleTypeRate[],
        };
        setPricing(pd);
      }

      const rawStates = (statesRes as any)?.states ?? statesRes;
      setStates(Array.isArray(rawStates) ? rawStates as StateItem[] : []);

      const rawTypes = (vehicleTypesRes as any)?.vehicleTypes ?? [];
      setVehicleTypes(Array.isArray(rawTypes) ? rawTypes as VehicleTypeItem[] : []);
    } finally {
      setFormLoading(false);
    }
  }, []);

  const handleOpenModal = useCallback(() => {
    setSelectedVehicle(null);
    setVehicleInputValue('');
    setSelectedDriver(null);
    setDriverInputValue('');
    setLoadingStateId(user?.entityId ?? '');
    setUnloadingStateId('');
    setOriginDescription('');
    setDestinationDescription('');
    setSubmitError(null);
    setActiveStatePicker(null);
    setVehicleRegisterError(null);
    setVehicleRegistering(false);
    setPendingRegNum(null);
    setPendingRegTypeId('');
    setModalVisible(true);
    loadFormData();
  }, [loadFormData, user]);

  // ── header button (web) ─────────────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS === 'web') {
      navigation.setOptions({
        headerRight: () => (
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleOpenModal}
              style={styles.headerBtn}
              accessibilityLabel="New trip"
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
  }, [navigation, handleOpenModal, handleLogout]);

  // ── state picker ────────────────────────────────────────────────────────────

  const openStatePicker = () => {
    setActiveStatePicker((prev) => (prev === 'unloading' ? null : 'unloading'));
  };

  const handleStateSelect = (state: StateItem) => {
    setUnloadingStateId(state.id);
    setActiveStatePicker(null);
  };

  const loadingStateName  = states.find((s) => s.id === loadingStateId)?.name  ?? '';
  const unloadingStateName = states.find((s) => s.id === unloadingStateId)?.name ?? '';

  // ── fee preview ─────────────────────────────────────────────────────────────

  const selectedTypeRate: VehicleTypeRate | null = (() => {
    if (!pricing || !selectedVehicle?.vehicleTypeId) return null;
    return pricing.vehicleTypeRates.find((r) => r.vehicleTypeId === selectedVehicle.vehicleTypeId) ?? null;
  })();

  // ── submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitError(null);

    if (!selectedVehicle) {
      setSubmitError('Please select a vehicle.');
      return;
    }
    if (!selectedDriver) {
      setSubmitError('Please select a driver.');
      return;
    }
    if (!loadingStateId) {
      setSubmitError('Loading state is not set. Please contact your administrator.');
      return;
    }
    if (!unloadingStateId) {
      setSubmitError('Please select an unloading state.');
      return;
    }
    if (!pricing) {
      setSubmitError('No active pricing chart. Cannot create trip.');
      return;
    }

    const body = {
      vehicleId:              selectedVehicle.id,
      driverId:               selectedDriver.id,
      loadingStateId,
      unloadingStateId,
      originDescription:      originDescription.trim() || undefined,
      destinationDescription: destinationDescription.trim() || undefined,
    };

    setSubmitting(true);
    try {
      await createTrip(body);
      setModalVisible(false);
      fetchTrips(true);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to create trip. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── cancel request ──────────────────────────────────────────────────────────

  const handleCancelRequest = useCallback(async () => {
    if (!cancelReason.trim()) {
      setCancelError('Please provide a reason.');
      return;
    }
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await requestCancellation(cancelModalTripId!, cancelReason.trim());
      setCancelModalTripId(null);
      setCancelReason('');
      fetchTrips(true);
    } catch (err: any) {
      setCancelError(err?.message ?? 'Failed to submit cancellation request.');
    } finally {
      setCancelSubmitting(false);
    }
  }, [cancelModalTripId, cancelReason, fetchTrips]);

  // ── renders ─────────────────────────────────────────────────────────────────

  const renderTrip = ({ item }: { item: TripItem }) => {
    const statusStyle = STATUS_STYLES[item.status] ?? STATUS_STYLES['cancelled']!;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(tripadmin)/trip-detail?id=${item.id}`)}
        activeOpacity={0.9}
      >
        <View style={styles.cardTop}>
          <View style={[styles.plateBadge, { flexShrink: 1, alignSelf: 'flex-start', marginRight: 8 }]}>
            <Text style={styles.plateText} numberOfLines={1} ellipsizeMode="tail">{item.vehicleNumber}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, flexShrink: 0 }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {STATUS_LABELS[item.status] ?? item.status}
            </Text>
          </View>
        </View>
        {item.vehicleTypeName ? (
          <Text style={styles.cardVehicleType}>{item.vehicleTypeName}</Text>
        ) : null}
        <View style={styles.cardRoute}>
          <MapPin size={14} color={theme.colors.grey1} />
          <Text style={styles.routeText} numberOfLines={1}>
            {item.loadingState.name} → {item.unloadingState.name}
          </Text>
        </View>
        {item.driver && (
          <View style={styles.cardDriver}>
            <User size={14} color={theme.colors.grey1} />
            <Text style={styles.driverEmail} numberOfLines={1}>{item.driver.email}</Text>
          </View>
        )}
        {item.createdByEmail === user?.email ? (
          <View style={styles.yourTripBadge}>
            <Text style={styles.yourTripBadgeText}>Your trip</Text>
          </View>
        ) : item.createdByName ? (
          <Text style={styles.createdByText} numberOfLines={1}>{item.createdByName}</Text>
        ) : null}
        {(item.status === 'created' || item.status === 'in_transit') && (
          <TouchableOpacity
            style={styles.cancelRequestBtn}
            onPress={() => {
              setCancelModalTripId(item.id);
              setCancelModalTripStatus(item.status);
              setCancelReason('');
              setCancelError(null);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelRequestBtnText}>Request Cancellation</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // ── loading / error screens ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (fetchError && trips.length === 0) {
    return (
      <View style={styles.center}>
        <CloudOff size={48} color={theme.colors.inactive} />
        <Text style={styles.fetchErrorTitle}>{fetchError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => fetchTrips()}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── main ────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <TopBar />
      <ScreenTransition style={{ flex: 1 }}>
      <SlideUpList style={{ flex: 1 }}>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        renderItem={renderTrip}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchTrips(true)}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Car size={48} color={theme.colors.inactive} />
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to create your first trip</Text>
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

      <TouchableOpacity
        style={styles.fab}
        onPress={handleOpenModal}
        activeOpacity={0.85}
        accessibilityLabel="New trip"
      >
        <Plus size={28} color={theme.colors.white} />
      </TouchableOpacity>

      {/* ── Trip creation modal ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Trip</Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              accessibilityLabel="Close"
            >
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          {formLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.formLoadingText}>Loading pricing data…</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Pricing chart error */}
              {pricingError && (
                <View style={styles.pricingErrorBox}>
                  <AlertTriangle size={18} color="#d97706" />
                  <Text style={styles.pricingErrorText}>{pricingError}</Text>
                </View>
              )}

              {/* VEHICLE */}
              <Text style={styles.sectionLabel}>VEHICLE</Text>

              {/* Inline type picker shown when a reg num is pending */}
              {pendingRegNum !== null ? (
                <View style={styles.inlineTypePickerBox}>
                  <View style={styles.inlineTypePendingRow}>
                    <View style={styles.plateBadgeSmall}>
                      <Text style={styles.plateTextSmall}>{pendingRegNum}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setPendingRegNum(null); setPendingRegTypeId(''); setVehicleRegisterError(null); }}
                      style={styles.changeBtn}
                    >
                      <Text style={styles.changeBtnText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.sectionLabel, { marginTop: 14, marginBottom: 8 }]}>SELECT VEHICLE TYPE</Text>
                  {vehicleTypes.length === 0 ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    vehicleTypes.map((vt) => {
                      const sel = vt.id === pendingRegTypeId;
                      return (
                        <TouchableOpacity
                          key={vt.id}
                          style={[styles.typeRow, sel && styles.typeRowSelected]}
                          onPress={() => setPendingRegTypeId(vt.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.typeRowText, sel && styles.typeRowTextSelected]}>{vt.name}</Text>
                          {sel && <Check size={16} color={theme.colors.primary} />}
                        </TouchableOpacity>
                      );
                    })
                  )}
                  <TouchableOpacity
                    style={[styles.confirmRegBtn, (!pendingRegTypeId || vehicleRegistering) && styles.confirmRegBtnDisabled]}
                    onPress={async () => {
                      if (!pendingRegNum || !pendingRegTypeId) return;
                      setVehicleRegisterError(null);
                      setVehicleRegistering(true);
                      try {
                        const created = await createVehicle({ registrationNumber: pendingRegNum, vehicleTypeId: pendingRegTypeId });
                        const v = created as any;
                        setSelectedVehicle({
                          id: v.id,
                          registrationNumber: v.registrationNumber,
                          vehicleTypeId: v.vehicleTypeId,
                          vehicleTypeName: v.vehicleTypeName,
                          createdBy: v.createdBy,
                          isActive: v.isActive,
                          createdAt: v.createdAt,
                        });
                        setVehicleInputValue(v.registrationNumber);
                        setPendingRegNum(null);
                        setPendingRegTypeId('');
                      } catch (err: any) {
                        if (err?.error === 'CONFLICT') {
                          setVehicleRegisterError('Already registered — search for it above.');
                        } else {
                          setVehicleRegisterError(err?.message ?? 'Failed to register vehicle.');
                        }
                      } finally {
                        setVehicleRegistering(false);
                      }
                    }}
                    disabled={!pendingRegTypeId || vehicleRegistering}
                    activeOpacity={0.85}
                  >
                    {vehicleRegistering
                      ? <ActivityIndicator size="small" color={theme.colors.white} />
                      : <Text style={styles.confirmRegBtnText}>Register Vehicle</Text>
                    }
                  </TouchableOpacity>
                </View>
              ) : (
                <VehicleSearchInput
                  value={vehicleInputValue}
                  onSelect={(v) => {
                    setSelectedVehicle(v);
                    setVehicleInputValue(v.registrationNumber);
                    setVehicleRegisterError(null);
                  }}
                  onRegisterNew={(regNum) => {
                    if (!regNum) return;
                    setVehicleRegisterError(null);
                    setPendingRegTypeId('');
                    setPendingRegNum(regNum);
                  }}
                  placeholder="Search registration number…"
                />
              )}
              {vehicleRegisterError && (
                <View style={styles.errorBox}>
                  <AlertCircle size={16} color={theme.colors.error} />
                  <Text style={styles.errorText}>{vehicleRegisterError}</Text>
                </View>
              )}

              {/* DRIVER */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>DRIVER</Text>
              <DriverSearchInput
                value={driverInputValue}
                onSelect={(d) => {
                  setSelectedDriver(d);
                  setDriverInputValue(d.fullName);
                }}
                placeholder="Search by name, license, or phone…"
              />

              {/* ROUTE */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>ROUTE</Text>

              {/* Loading state — read-only, locked to user's state */}
              <Text style={styles.fieldSubLabel}>Loading State (Origin)</Text>
              <View style={styles.disabledField}>
                <Text style={styles.disabledFieldText}>{loadingStateName || 'Loading...'}</Text>
              </View>

              {/* Unloading state picker */}
              <Text style={[styles.fieldSubLabel, { marginTop: 14 }]}>Unloading State (Destination)</Text>
              <TouchableOpacity
                style={styles.pickerField}
                onPress={openStatePicker}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.pickerFieldText,
                    !unloadingStateName && styles.pickerFieldPlaceholder,
                  ]}
                >
                  {unloadingStateName || 'Select unloading state…'}
                </Text>
                {activeStatePicker === 'unloading' ? <ChevronUp size={18}
                  color={theme.colors.grey1} /> : <ChevronDown size={18}
                  color={theme.colors.grey1} />}
              </TouchableOpacity>
              {activeStatePicker === 'unloading' && (
                <ScrollView
                  style={styles.inlinePickerList}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {states.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.inlinePickerRow}
                      onPress={() => handleStateSelect(s)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.stateRowText}>{s.name}</Text>
                      <Text style={styles.stateRowCode}>{s.code}</Text>
                    </TouchableOpacity>
                  ))}
                  {states.length === 0 && (
                    <Text style={styles.inlinePickerEmpty}>No states available</Text>
                  )}
                </ScrollView>
              )}

              {/* FEES — derived from selected vehicle type rate */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>FEES</Text>
              {!selectedVehicle ? (
                <View style={styles.feePlaceholderBox}>
                  <Text style={styles.feePlaceholderText}>Select a vehicle to see fee preview</Text>
                </View>
              ) : !selectedVehicle.vehicleTypeId ? (
                <View style={styles.feePlaceholderBox}>
                  <Text style={styles.feePlaceholderText}>Vehicle has no type assigned</Text>
                </View>
              ) : !pricing ? (
                <View style={styles.feePlaceholderBox}>
                  <Text style={styles.feePlaceholderText}>No active pricing chart</Text>
                </View>
              ) : !selectedTypeRate ? (
                <View style={styles.feePlaceholderBox}>
                  <Text style={styles.feePlaceholderText}>No rate configured for this vehicle type</Text>
                </View>
              ) : (
                <View style={styles.feeCard}>
                  <Text style={styles.feeCardTypeLabel}>{selectedTypeRate.vehicleTypeName}</Text>
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Loading Fee</Text>
                    <Text style={styles.feeAmount}>{formatNaira(selectedTypeRate.loadingFee)}</Text>
                  </View>
                  <View style={[styles.feeRow, { borderBottomWidth: selectedTypeRate.stakeholderRates.length > 0 ? StyleSheet.hairlineWidth : 0 }]}>
                    <Text style={styles.feeLabel}>Unloading Fee</Text>
                    <Text style={styles.feeAmount}>{formatNaira(selectedTypeRate.unloadingFee)}</Text>
                  </View>
                  {selectedTypeRate.stakeholderRates.map((sr, idx) => (
                    <View key={sr.stakeholderId} style={[styles.feeRow, idx === selectedTypeRate.stakeholderRates.length - 1 ? styles.feeRowLast : {}]}>
                      <Text style={styles.feeLabel}>{sr.stakeholderName}</Text>
                      <Text style={styles.feeAmount}>{formatNaira(sr.amount)}</Text>
                    </View>
                  ))}
                  {/* Total */}
                  <View style={styles.totalDivider} />
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalAmount}>
                      {formatNaira(
                        (selectedTypeRate?.loadingFee ?? 0) +
                        (selectedTypeRate?.unloadingFee ?? 0) +
                        (selectedTypeRate?.stakeholderRates ?? []).reduce((sum, r) => sum + r.amount, 0)
                      )}
                    </Text>
                  </View>
                </View>
              )}

              {/* DESCRIPTION (optional) */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={styles.textField}
                value={originDescription}
                onChangeText={setOriginDescription}
                placeholder="Origin description"
                placeholderTextColor={theme.colors.grey1}
                autoCorrect={false}
              />
              <TextInput
                style={[styles.textField, { marginTop: 10 }]}
                value={destinationDescription}
                onChangeText={setDestinationDescription}
                placeholder="Destination description"
                placeholderTextColor={theme.colors.grey1}
                autoCorrect={false}
              />

              {/* Submit error */}
              {submitError && (
                <View style={styles.errorBox}>
                  <AlertCircle size={16} color={theme.colors.error} />
                  <Text style={styles.errorText}>{submitError}</Text>
                </View>
              )}

              {/* Submit button */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (submitting || !!pricingError) && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                activeOpacity={0.85}
                disabled={submitting || !!pricingError}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Create Trip</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Cancellation request modal ── */}
      <Modal
        visible={cancelModalTripId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => { Keyboard.dismiss(); setCancelModalTripId(null); setCancelModalTripStatus(null); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.cancelOverlay} onPress={Keyboard.dismiss}>
            <Pressable style={styles.cancelSheet}>
              <Text style={styles.cancelSheetTitle}>Request Cancellation</Text>
              {cancelModalTripStatus === 'in_transit' && (
                <View style={styles.inTransitWarningBanner}>
                  <AlertTriangle size={18} color="#d97706" />
                  <Text style={styles.inTransitWarningText}>
                    This trip is currently in transit. Cancellation requests for in-transit trips require State Admin approval and may take longer to process.
                  </Text>
                </View>
              )}
              <Text style={styles.cancelSheetSubtitle}>
                Your State Admin will review this request. Please explain why this trip needs to be cancelled.
              </Text>
              <TextInput
                style={[styles.textField, styles.cancelReasonInput]}
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="Enter reason…"
                placeholderTextColor={theme.colors.grey1}
                multiline
                numberOfLines={3}
                autoCorrect={false}
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                maxLength={500}
              />
              <Text style={styles.charCounter}>{cancelReason.length} / 500</Text>
              {cancelError && (
                <View style={[styles.errorBox, { marginTop: 8 }]}>
                  <AlertCircle size={16} color={theme.colors.error} />
                  <Text style={styles.errorText}>{cancelError}</Text>
                </View>
              )}
              <View style={styles.cancelSheetActions}>
                <TouchableOpacity
                  style={styles.cancelSheetDismiss}
                  onPress={() => { Keyboard.dismiss(); setCancelModalTripId(null); setCancelModalTripStatus(null); }}
                  activeOpacity={0.7}
                  disabled={cancelSubmitting}
                >
                  <Text style={styles.cancelSheetDismissText}>Keep Trip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelSheetSubmit, cancelSubmitting && styles.submitButtonDisabled]}
                  onPress={handleCancelRequest}
                  activeOpacity={0.85}
                  disabled={cancelSubmitting}
                >
                  {cancelSubmitting ? (
                    <ActivityIndicator size="small" color={theme.colors.white} />
                  ) : (
                    <Text style={styles.cancelSheetSubmitText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      </ScreenTransition>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  headerBtn: {
    padding: 6,
  },

  // list
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    gap: 8,
    ...theme.shadows.card,
  },
  cardTop: {
    flex: 1,
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
  cardVehicleType: {
    fontSize: 12,
    color: theme.colors.grey1,
    fontWeight: '500',
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  routeText: {
    fontSize: 13,
    color: theme.colors.grey2,
    fontWeight: '500',
    flex: 1,
  },
  cardDriver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  driverEmail: {
    fontSize: 13,
    color: theme.colors.grey1,
    flex: 1,
  },
  yourTripBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: theme.colors.blueMuted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  yourTripBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.blueText,
  },
  createdByText: {
    fontSize: 12,
    color: theme.colors.grey1,
    marginTop: 5,
  },

  // empty / error
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

  // FAB
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

  // modal
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
  formScroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  formContent: {
    padding: 20,
  },
  formLoadingText: {
    fontSize: 14,
    color: theme.colors.grey1,
    marginTop: 12,
  },

  // pricing error
  pricingErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  pricingErrorText: {
    fontSize: 14,
    color: '#92400e',
    flex: 1,
    lineHeight: 20,
  },

  // section label
  sectionLabel: {
    ...theme.typography.sectionLabel,
    marginBottom: 10,
  },
  fieldSubLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
    marginBottom: 6,
  },

  // locked field (read-only loading state)
  lockedField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.grey4,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  lockedFieldText: {
    fontSize: 15,
    color: theme.colors.grey2,
    fontWeight: '500',
    flex: 1,
  },
  lockedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.grey1,
    backgroundColor: theme.colors.grey3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  // fee rows
  feePlaceholderBox: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...theme.shadows.card,
  },
  feePlaceholderText: {
    fontSize: 14,
    color: theme.colors.grey1,
    textAlign: 'center',
  },
  feeCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  feeCardTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: theme.colors.grey1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  feeRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 14,
  },
  feeLabel: {
    fontSize: 14,
    color: theme.colors.black,
    fontWeight: '500',
  },
  feeAmount: {
    fontSize: 14,
    color: theme.colors.grey2,
    fontWeight: '700',
  },
  disabledField: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 14,
  },
  disabledFieldText: {
    fontSize: 16,
    color: '#666666',
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.black,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
  },

  // inline type picker (in trip form)
  inlineTypePickerBox: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 14,
    ...theme.shadows.card,
    gap: 0,
  },
  inlineTypePendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  plateBadgeSmall: {
    backgroundColor: theme.colors.blueMuted,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  plateTextSmall: {
    fontSize: 13,
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
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
  },
  typeRowSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.blueMuted,
  },
  typeRowText: {
    fontSize: 14,
    color: theme.colors.black,
    fontWeight: '500',
  },
  typeRowTextSelected: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  confirmRegBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  confirmRegBtnDisabled: {
    opacity: 0.5,
  },
  confirmRegBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.white,
  },

  // state picker field
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  pickerFieldText: {
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '500',
    flex: 1,
  },
  pickerFieldPlaceholder: {
    color: theme.colors.grey1,
    fontWeight: '400',
  },

  // text inputs
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

  // submit
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginTop: 20,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    flex: 1,
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

  // inline state picker
  inlinePickerList: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.white,
    overflow: 'hidden',
    maxHeight: 240,
    ...theme.shadows.card,
  },
  inlinePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  inlinePickerEmpty: {
    fontSize: 14,
    color: theme.colors.grey1,
    padding: 16,
    textAlign: 'center',
  },
  stateRowText: {
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '500',
  },
  stateRowCode: {
    fontSize: 13,
    color: theme.colors.grey1,
    fontWeight: '600',
  },

  // cancel request button (on trip card)
  cancelRequestBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff4ed',
    borderWidth: 1,
    borderColor: '#ea580c',
  },
  cancelRequestBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ea580c',
  },

  // cancellation modal overlay
  cancelOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  cancelSheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 12,
  },
  cancelSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.black,
  },
  inTransitWarningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  inTransitWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
  },
  cancelSheetSubtitle: {
    fontSize: 14,
    color: theme.colors.grey1,
    lineHeight: 20,
  },
  cancelReasonInput: {
    height: 88,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  charCounter: {
    fontSize: 12,
    color: theme.colors.grey1,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 4,
  },
  cancelSheetActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelSheetDismiss: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
  },
  cancelSheetDismissText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  cancelSheetSubmit: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#ea580c',
  },
  cancelSheetSubmitText: {
    fontSize: 15,
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
