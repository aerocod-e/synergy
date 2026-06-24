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
  Switch,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import VehicleSearchInput, { type Vehicle } from '@/components/VehicleSearchInput';
import DriverSearchInput, { type Driver } from '@/components/DriverSearchInput';
import { getTrips, createTrip, getActivePricingChart, getStates, requestCancellation, createVehicle } from '@/services/api';
import { formatNaira } from '@/utils/formatCurrency';
import { useLogout } from '@/hooks/useLogout';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TripItem {
  id: string;
  vehicleNumber: string;
  status: 'created' | 'in_transit' | 'completed' | 'cancelled' | 'cancellation_pending' | string;
  loadingState: { id: string; name: string; code: string };
  unloadingState: { id: string; name: string; code: string };
  driver: { id: string; email: string } | null;
  originDescription: string | null;
  destinationDescription: string | null;
  createdAt: string;
}

interface StakeholderRate {
  id: string;
  stakeholder_id: string;
  amount: number;
  stakeholder_name: string;
}

interface PricingData {
  stakeholderRates: StakeholderRate[];
}

interface StateItem {
  id: string;
  name: string;
  code: string;
  loadingRate: number;
  unloadingRate: number;
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
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  // inline state picker
  const [activeStatePicker, setActiveStatePicker] = useState<'loading' | 'unloading' | null>(null);

  // vehicle inline registration
  const [vehicleRegistering, setVehicleRegistering] = useState(false);
  const [vehicleRegisterError, setVehicleRegisterError] = useState<string | null>(null);

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
      // silent fail
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
    try {
      const [pricingRes, statesRes] = await Promise.all([
        getActivePricingChart().catch(() => null),
        getStates().catch(() => []),
      ]);

      if (!pricingRes) {
        setPricingError('No active pricing chart. Contact your administrator before creating a trip.');
      } else {
        const chart = (pricingRes as any).chart;
        const pd: PricingData = {
          stakeholderRates: (chart.stakeholder_rates ?? []) as StakeholderRate[],
        };
        setPricing(pd);
        const initialToggles: Record<string, boolean> = {};
        for (const r of pd.stakeholderRates) {
          initialToggles[r.stakeholder_id] = false;
        }
        setToggles(initialToggles);
      }

      const rawStates = (statesRes as any)?.states ?? statesRes;
      setStates(Array.isArray(rawStates) ? rawStates as StateItem[] : []);
    } finally {
      setFormLoading(false);
    }
  }, []);

  const handleOpenModal = useCallback(() => {
    setSelectedVehicle(null);
    setVehicleInputValue('');
    setSelectedDriver(null);
    setDriverInputValue('');
    setLoadingStateId('');
    setUnloadingStateId('');
    setOriginDescription('');
    setDestinationDescription('');
    setToggles({});
    setSubmitError(null);
    setActiveStatePicker(null);
    setVehicleRegisterError(null);
    setVehicleRegistering(false);
    setModalVisible(true);
    loadFormData();
  }, [loadFormData]);

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
              <Ionicons name="add-circle-outline" size={26} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.headerBtn}>
              <Ionicons name="log-out-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        ),
      });
    }
  }, [navigation, handleOpenModal, handleLogout]);

  // ── state picker ────────────────────────────────────────────────────────────

  const openStatePicker = (which: 'loading' | 'unloading') => {
    setActiveStatePicker((prev) => (prev === which ? null : which));
  };

  const handleStateSelect = (state: StateItem, which: 'loading' | 'unloading') => {
    if (which === 'loading') setLoadingStateId(state.id);
    else setUnloadingStateId(state.id);
    setActiveStatePicker(null);
  };

  const loadingStateName  = states.find((s) => s.id === loadingStateId)?.name  ?? '';
  const unloadingStateName = states.find((s) => s.id === unloadingStateId)?.name ?? '';

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
      setSubmitError('Please select a loading state.');
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

    const stakeholders = pricing.stakeholderRates.map((r) => ({
      stakeholderId: r.stakeholder_id,
      amount:        r.amount,
      enabled:       toggles[r.stakeholder_id] ?? false,
    }));

    const body = {
      vehicleId:              selectedVehicle.id,
      driverId:               selectedDriver.id,
      loadingStateId,
      unloadingStateId,
      originDescription:      originDescription.trim() || undefined,
      destinationDescription: destinationDescription.trim() || undefined,
      fees: {
        stakeholders,
      },
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
        <View style={styles.cardRoute}>
          <Ionicons name="location-outline" size={14} color={theme.colors.grey1} />
          <Text style={styles.routeText} numberOfLines={1}>
            {item.loadingState.name} → {item.unloadingState.name}
          </Text>
        </View>
        {item.driver && (
          <View style={styles.cardDriver}>
            <Ionicons name="person-outline" size={14} color={theme.colors.grey1} />
            <Text style={styles.driverEmail} numberOfLines={1}>{item.driver.email}</Text>
          </View>
        )}
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
        <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.inactive} />
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
            <Ionicons name="car-outline" size={48} color={theme.colors.inactive} />
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

      {Platform.OS !== 'web' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleOpenModal}
          activeOpacity={0.85}
          accessibilityLabel="New trip"
        >
          <Ionicons name="add" size={28} color={theme.colors.white} />
        </TouchableOpacity>
      )}

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
              <Ionicons name="close" size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          {formLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.formLoadingText}>Loading pricing & states…</Text>
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
                  <Ionicons name="warning-outline" size={18} color="#d97706" />
                  <Text style={styles.pricingErrorText}>{pricingError}</Text>
                </View>
              )}

              {/* STAKEHOLDERS */}
              {pricing && pricing.stakeholderRates.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>STAKEHOLDERS</Text>
                  {pricing.stakeholderRates.map((rate) => (
                    <View key={rate.stakeholder_id} style={styles.stakeholderRow}>
                      <View style={styles.stakeholderLeft}>
                        <Text style={styles.stakeholderName}>{rate.stakeholder_name}</Text>
                        <Text style={styles.stakeholderAmount}>{formatNaira(rate.amount)}</Text>
                      </View>
                      <Switch
                        value={toggles[rate.stakeholder_id] ?? false}
                        onValueChange={(val) =>
                          setToggles((prev) => ({ ...prev, [rate.stakeholder_id]: val }))
                        }
                        trackColor={{ false: theme.colors.inactive, true: theme.colors.primary }}
                        thumbColor={theme.colors.white}
                      />
                    </View>
                  ))}
                </>
              )}

              {/* VEHICLE */}
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>VEHICLE</Text>
              <VehicleSearchInput
                value={vehicleInputValue}
                onSelect={(v) => {
                  setSelectedVehicle(v);
                  setVehicleInputValue(v.registrationNumber);
                  setVehicleRegisterError(null);
                }}
                onRegisterNew={async (regNum) => {
                  if (!regNum) return;
                  setVehicleRegisterError(null);
                  setVehicleRegistering(true);
                  try {
                    const created = await createVehicle(regNum);
                    const v = created as any;
                    setSelectedVehicle({
                      id: v.id,
                      registrationNumber: v.registrationNumber,
                      createdBy: v.createdBy,
                      isActive: v.isActive,
                      createdAt: v.createdAt,
                    });
                    setVehicleInputValue(v.registrationNumber);
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
                placeholder="Search registration number…"
              />
              {vehicleRegistering && (
                <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 8 }} />
              )}
              {vehicleRegisterError && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
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

              <TouchableOpacity
                style={styles.pickerField}
                onPress={() => openStatePicker('loading')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.pickerFieldText,
                    !loadingStateName && styles.pickerFieldPlaceholder,
                  ]}
                >
                  {loadingStateName || 'Select loading state…'}
                </Text>
                <Ionicons
                  name={activeStatePicker === 'loading' ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={theme.colors.grey1}
                />
              </TouchableOpacity>
              {activeStatePicker === 'loading' && (
                <ScrollView
                  style={styles.inlinePickerList}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {states.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.inlinePickerRow}
                      onPress={() => handleStateSelect(s, 'loading')}
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

              <TouchableOpacity
                style={[styles.pickerField, { marginTop: 10 }]}
                onPress={() => openStatePicker('unloading')}
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
                <Ionicons
                  name={activeStatePicker === 'unloading' ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={theme.colors.grey1}
                />
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
                      onPress={() => handleStateSelect(s, 'unloading')}
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

              {/* FEES (derived from selected state rates) */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>FEES</Text>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Loading Fee</Text>
                {loadingStateId ? (
                  <Text style={styles.feeAmount}>
                    {formatNaira(states.find((s) => s.id === loadingStateId)?.loadingRate ?? 0)}
                    {loadingStateName ? ` (${loadingStateName} rate)` : ''}
                  </Text>
                ) : (
                  <Text style={[styles.feeAmount, styles.feePlaceholder]}>Select loading state</Text>
                )}
              </View>
              <View style={[styles.feeRow, styles.feeRowLast]}>
                <Text style={styles.feeLabel}>Unloading Fee</Text>
                {unloadingStateId ? (
                  <Text style={styles.feeAmount}>
                    {formatNaira(states.find((s) => s.id === unloadingStateId)?.unloadingRate ?? 0)}
                    {unloadingStateName ? ` (${unloadingStateName} rate)` : ''}
                  </Text>
                ) : (
                  <Text style={[styles.feeAmount, styles.feePlaceholder]}>Select unloading state</Text>
                )}
              </View>

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
                  <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
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
                  <Ionicons name="warning-outline" size={18} color="#d97706" />
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
                  <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
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

  // fee rows
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  feeRowLast: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomWidth: 0,
  },
  feeLabel: {
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '500',
  },
  feeAmount: {
    fontSize: 15,
    color: theme.colors.grey2,
    fontWeight: '700',
  },
  feePlaceholder: {
    color: theme.colors.grey1,
    fontWeight: '400',
    fontSize: 14,
  },

  // stakeholder rows
  stakeholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
    ...theme.shadows.card,
  },
  stakeholderLeft: {
    flex: 1,
    gap: 2,
  },
  stakeholderName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
  },
  stakeholderAmount: {
    fontSize: 13,
    color: theme.colors.grey1,
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
