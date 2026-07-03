import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

import { Ban, ChevronDown, ChevronRight, ChevronUp, Pencil, Plus, RotateCcw, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getActivePricingChart,
  listVehicleTypes,
  updateVehicleType,
  updateStakeholderRate,
  createVehicleType,
  getAllWallets,
  getVehicleTypeVehicleCount,
  setVehicleTypeActive,
} from '@/services/api';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import ScreenTransition from '@/components/ScreenTransition';
import SlideUpList from '@/components/SlideUpList';
import { confirmAction, notifyAction } from '@/utils/confirmAction';
import { formatNaira } from '@/utils/formatCurrency';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
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
  isActive: boolean;
  stakeholderRates: VehicleTypeStakeholderRate[];
}

interface PricingChart {
  id: string;
  isActive: boolean;
  vehicleTypeRates: VehicleTypeRate[];
}

interface VehicleTypeItem {
  id: string;
  name: string;
}

interface Wallet {
  id: string;
  ownerId: string;
  ownerType: string;
  ownerName: string;
  totalCollected: number;
  isClearingEnabled: boolean;
  ownerIsActive: boolean;
}

function nairaToKobo(val: string): number {
  return Math.round(parseFloat(val) * 100);
}

function isValidNaira(val: string): boolean {
  const n = parseFloat(val);
  return val.trim() !== '' && !isNaN(n) && n > 0;
}

function isValidAmount(val: string): boolean {
  const n = parseFloat(val);
  return val.trim() !== '' && !isNaN(n) && n >= 0;
}

function ActiveChartCard({
  chart,
  onEdit,
  onToggleActive,
}: {
  chart: PricingChart;
  onEdit: (vtr: VehicleTypeRate) => void;
  onToggleActive: (vtr: VehicleTypeRate) => void;
}) {
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);

  return (
    <View style={styles.card}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>ACTIVE PRICING CHART</Text>
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>ACTIVE</Text>
        </View>
      </View>
      {chart.vehicleTypeRates.length === 0 ? (
        <Text style={styles.emptyRatesText}>No vehicle type rates configured</Text>
      ) : (
        chart.vehicleTypeRates.map((vtr, idx) => {
          const expanded = expandedTypeId === vtr.vehicleTypeId;
          return (
            <View key={vtr.vehicleTypeId} style={!vtr.isActive && styles.inactiveTypeRow}>
              {idx > 0 && <View style={styles.divider} />}
              <View style={styles.typeRateHeaderRow}>
                <TouchableOpacity
                  style={styles.typeRateHeaderMain}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setExpandedTypeId(expanded ? null : vtr.vehicleTypeId);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.typeRateNameRow}>
                    <Text style={[styles.typeRateName, !vtr.isActive && styles.mutedText]}>{vtr.vehicleTypeName}</Text>
                    {!vtr.isActive && (
                      <View style={styles.inactiveBadge}>
                        <Text style={styles.inactiveBadgeText}>INACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.vehicleTypeTotal, !vtr.isActive && styles.mutedText]}>{formatNaira(
                    vtr.loadingFee + vtr.unloadingFee +
                    vtr.stakeholderRates.reduce((sum, sr) => sum + sr.amount, 0)
                  )}</Text>
                  {expanded
                    ? <ChevronUp size={16} color={theme.colors.grey1} />
                    : <ChevronDown size={16} color={theme.colors.grey1} />}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onEdit(vtr)}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  style={styles.editIconBtn}
                  accessibilityLabel="Edit vehicle type"
                  accessibilityRole="button"
                >
                  <Pencil size={15} color={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onToggleActive(vtr)}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  style={[styles.editIconBtn, styles.toggleIconBtn]}
                  accessibilityLabel={vtr.isActive ? 'Deactivate vehicle type' : 'Reactivate vehicle type'}
                  accessibilityRole="button"
                >
                  {vtr.isActive
                    ? <Ban size={15} color={theme.colors.error} />
                    : <RotateCcw size={15} color={theme.colors.greenText} />}
                </TouchableOpacity>
              </View>
              {expanded && (
                <View style={styles.typeRateBody}>
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Loading Fee</Text>
                    <Text style={styles.feeValue}>{formatNaira(vtr.loadingFee)}</Text>
                  </View>
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Unloading Fee</Text>
                    <Text style={styles.feeValue}>{formatNaira(vtr.unloadingFee)}</Text>
                  </View>
                  {vtr.stakeholderRates.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.subLabel}>STAKEHOLDER RATES</Text>
                      {vtr.stakeholderRates.map((sr) => (
                        <View key={sr.stakeholderId} style={styles.feeRow}>
                          <Text style={styles.feeLabel}>{sr.stakeholderName}</Text>
                          <Text style={styles.feeValue}>{formatNaira(sr.amount)}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

export default function ConfigScreen() {
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<PricingChart | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeItem[]>([]);
  const [allWallets, setAllWallets] = useState<Wallet[]>([]);
  const [eodSearch, setEodSearch] = useState('');
  const [eodFilter, setEodFilter] = useState<'all' | 'states' | 'stakeholders'>('all');

  type EditSrEntry = { stakeholderId: string; stakeholderName: string; amount: string };

  const [editVtModal, setEditVtModal] = useState<{
    vehicleTypeId: string;
    vehicleTypeName: string;
    name: string;
    loadingFee: string;
    unloadingFee: string;
    stakeholderRates: EditSrEntry[];
  } | null>(null);
  const [editVtSubmitting, setEditVtSubmitting] = useState(false);
  const [editVtError, setEditVtError] = useState<string | null>(null);
  const [togglingVtId, setTogglingVtId] = useState<string | null>(null);

  const [addVtVisible, setAddVtVisible] = useState(false);
  const [addVtName, setAddVtName] = useState('');
  const [addVtLoadingFee, setAddVtLoadingFee] = useState('');
  const [addVtUnloadingFee, setAddVtUnloadingFee] = useState('');
  const [addVtStakeholderRates, setAddVtStakeholderRates] = useState<EditSrEntry[]>([]);
  const [addVtSubmitting, setAddVtSubmitting] = useState(false);
  const [addVtError, setAddVtError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setPageError(null);
    try {
      const [chartResult, vehicleTypesResult, walletsResult] = await Promise.allSettled([
        getActivePricingChart(),
        listVehicleTypes(),
        getAllWallets(),
      ]);

      if (chartResult.status === 'fulfilled') {
        setActiveChart(chartResult.value?.chart ?? null);
      } else if ((chartResult.reason as any)?.error !== 'NOT_FOUND') {
        setPageError('Failed to load pricing data');
        return;
      } else {
        setActiveChart(null);
      }

      if (vehicleTypesResult.status === 'fulfilled') {
        setVehicleTypes((vehicleTypesResult.value as any)?.vehicleTypes ?? []);
      }

      if (walletsResult.status === 'fulfilled') {
        const wallets: any[] = (walletsResult.value as any)?.wallets ?? [];
        const mapped: Wallet[] = wallets.map((w: any) => ({
          id: w.id,
          ownerId: w.ownerId ?? w.owner_id,
          ownerType: w.ownerType ?? w.owner_type ?? '',
          ownerName: w.ownerName ?? w.owner_name ?? 'Unknown',
          totalCollected: w.totalCollected ?? w.total_collected ?? 0,
          isClearingEnabled: w.isClearingEnabled ?? w.is_clearing_enabled ?? false,
          ownerIsActive: w.ownerIsActive ?? w.owner_is_active ?? true,
        }));
        setAllWallets(mapped);
      }
    } finally {
      setPageLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleOpenEditVt = (vtr: VehicleTypeRate) => {
    setEditVtModal({
      vehicleTypeId: vtr.vehicleTypeId,
      vehicleTypeName: vtr.vehicleTypeName,
      name: vtr.vehicleTypeName,
      loadingFee: (vtr.loadingFee / 100).toFixed(2),
      unloadingFee: (vtr.unloadingFee / 100).toFixed(2),
      stakeholderRates: vtr.stakeholderRates.map((sr) => ({
        stakeholderId: sr.stakeholderId,
        stakeholderName: sr.stakeholderName,
        amount: (sr.amount / 100).toFixed(2),
      })),
    });
    setEditVtError(null);
  };

  const handleSubmitEditVt = async () => {
    if (!editVtModal || !activeChart) return;
    if (!editVtModal.name.trim()) {
      setEditVtError('Vehicle type name is required.');
      return;
    }
    if (!isValidNaira(editVtModal.loadingFee)) {
      setEditVtError('Enter a valid loading fee greater than zero.');
      return;
    }
    if (!isValidNaira(editVtModal.unloadingFee)) {
      setEditVtError('Enter a valid unloading fee greater than zero.');
      return;
    }
    for (const sr of editVtModal.stakeholderRates) {
      if (!isValidAmount(sr.amount)) {
        setEditVtError(`Enter a valid amount (₦0 or more) for ${sr.stakeholderName}.`);
        return;
      }
    }
    setEditVtSubmitting(true);
    setEditVtError(null);
    try {
      await Promise.all([
        updateVehicleType(editVtModal.vehicleTypeId, {
          name: editVtModal.name.trim(),
          loadingFee: nairaToKobo(editVtModal.loadingFee),
          unloadingFee: nairaToKobo(editVtModal.unloadingFee),
        }),
        ...editVtModal.stakeholderRates.map((sr) =>
          updateStakeholderRate(activeChart.id, {
            stakeholderId: sr.stakeholderId,
            vehicleTypeId: editVtModal.vehicleTypeId,
            amount: nairaToKobo(sr.amount),
          })
        ),
      ]);
      setEditVtModal(null);
      setPageLoading(true);
      await loadData();
    } catch (e: any) {
      if ((e as any)?.error === 'CONFLICT') {
        setEditVtError('A vehicle type with this name already exists.');
      } else {
        setEditVtError(e?.message ?? 'Failed to save changes.');
      }
    } finally {
      setEditVtSubmitting(false);
    }
  };

  const handleToggleVtActive = (vtr: VehicleTypeRate) => {
    if (vtr.isActive) {
      setTogglingVtId(vtr.vehicleTypeId);
      getVehicleTypeVehicleCount(vtr.vehicleTypeId)
        .then((res: any) => {
          const count = res?.vehicleCount ?? 0;
          const message = `This vehicle type is currently assigned to ${count} vehicle${count === 1 ? '' : 's'}. Deactivating it will prevent those vehicles from being used in new trips until reassigned. Continue?`;

          const doDeactivate = async () => {
            try {
              await setVehicleTypeActive(vtr.vehicleTypeId, false);
              setPageLoading(true);
              await loadData();
            } catch (e: any) {
              notifyAction('Error', e?.message ?? 'Failed to deactivate vehicle type.');
            } finally {
              setTogglingVtId(null);
            }
          };

          confirmAction({
            title: 'Deactivate Vehicle Type',
            message,
            confirmText: 'Deactivate',
            destructive: true,
            onConfirm: doDeactivate,
            onCancel: () => setTogglingVtId(null),
          });
        })
        .catch((e: any) => {
          setTogglingVtId(null);
          notifyAction('Error', e?.message ?? 'Failed to retrieve vehicle count.');
        });
    } else {
      setTogglingVtId(vtr.vehicleTypeId);
      setVehicleTypeActive(vtr.vehicleTypeId, true)
        .then(async () => {
          setPageLoading(true);
          await loadData();
        })
        .catch((e: any) => {
          notifyAction('Error', e?.message ?? 'Failed to reactivate vehicle type.');
        })
        .finally(() => setTogglingVtId(null));
    }
  };

  const handleOpenAddVt = () => {
    setAddVtName('');
    setAddVtLoadingFee('');
    setAddVtUnloadingFee('');
    const seen = new Set<string>();
    const rates: EditSrEntry[] = [];
    (activeChart?.vehicleTypeRates ?? []).forEach((vtr) => {
      vtr.stakeholderRates.forEach((sr) => {
        if (!seen.has(sr.stakeholderId)) {
          seen.add(sr.stakeholderId);
          rates.push({ stakeholderId: sr.stakeholderId, stakeholderName: sr.stakeholderName, amount: '0' });
        }
      });
    });
    setAddVtStakeholderRates(rates);
    setAddVtError(null);
    setAddVtVisible(true);
  };

  const handleSubmitAddVt = async () => {
    if (!addVtName.trim()) {
      setAddVtError('Vehicle type name is required.');
      return;
    }
    if (!isValidNaira(addVtLoadingFee)) {
      setAddVtError('Enter a valid loading fee greater than zero.');
      return;
    }
    if (!isValidNaira(addVtUnloadingFee)) {
      setAddVtError('Enter a valid unloading fee greater than zero.');
      return;
    }
    for (const sr of addVtStakeholderRates) {
      if (!isValidAmount(sr.amount)) {
        setAddVtError(`Enter a valid amount (₦0 or more) for ${sr.stakeholderName}.`);
        return;
      }
    }
    setAddVtSubmitting(true);
    setAddVtError(null);
    try {
      const created = await createVehicleType({
        name: addVtName.trim(),
        loadingFee: nairaToKobo(addVtLoadingFee),
        unloadingFee: nairaToKobo(addVtUnloadingFee),
      }) as any;
      const newVehicleTypeId: string | undefined = created?.vehicleType?.id ?? created?.id;
      if (newVehicleTypeId && activeChart && addVtStakeholderRates.length > 0) {
        await Promise.all(
          addVtStakeholderRates.map((sr) =>
            updateStakeholderRate(activeChart.id, {
              stakeholderId: sr.stakeholderId,
              vehicleTypeId: newVehicleTypeId,
              amount: nairaToKobo(sr.amount),
            })
          )
        );
      }
      setAddVtVisible(false);
      setPageLoading(true);
      await loadData();
    } catch (e: any) {
      if ((e as any)?.error === 'CONFLICT') {
        setAddVtError('A vehicle type with this name already exists.');
      } else {
        setAddVtError((e as any)?.message ?? 'Failed to create vehicle type.');
      }
    } finally {
      setAddVtSubmitting(false);
    }
  };

  if (pageLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (pageError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{pageError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => { setPageLoading(true); loadData(); }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar />
      <ScreenTransition style={{ flex: 1 }}>
      <SlideUpList style={{ flex: 1 }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >

        <Text style={styles.sectionLabel}>Pricing Chart</Text>
        {activeChart ? (
          <ActiveChartCard
            chart={activeChart}
            onEdit={handleOpenEditVt}
            onToggleActive={handleToggleVtActive}
          />
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active pricing chart set</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.addVtRow}
          onPress={handleOpenAddVt}
          activeOpacity={0.75}
        >
          <Plus size={18} color={theme.colors.primary} />
          <Text style={styles.addVtText}>Add Vehicle Type</Text>
        </TouchableOpacity>

        {allWallets.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>EOD Payment Clearing</Text>
            <View style={styles.eodControlsRow}>
              <TextInput
                style={styles.eodSearchInput}
                placeholder="Search..."
                placeholderTextColor={theme.colors.placeholder}
                autoCorrect={false}
                value={eodSearch}
                onChangeText={setEodSearch}
              />
            </View>
            <View style={styles.eodFilterRow}>
              {(['all', 'states', 'stakeholders'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.eodFilterBtn, eodFilter === f && styles.eodFilterBtnActive]}
                  onPress={() => setEodFilter(f)}
                >
                  <Text style={[styles.eodFilterBtnText, eodFilter === f && styles.eodFilterBtnTextActive]}>
                    {f === 'all' ? 'All' : f === 'states' ? 'States' : 'Stakeholders'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {allWallets
              .filter((w) => {
                if (eodFilter === 'states') return w.ownerType === 'state';
                if (eodFilter === 'stakeholders') return w.ownerType === 'stakeholder';
                return true;
              })
              .filter((w) => !eodSearch.trim() || w.ownerName.toLowerCase().includes(eodSearch.toLowerCase()))
              .map((w) => (
                <View key={w.id} style={[styles.eodCard, !w.ownerIsActive && styles.eodCardInactive]}>
                  <View style={styles.eodCardLeft}>
                    <Text style={styles.eodStateName}>{w.ownerName}</Text>
                    <Text style={styles.eodBalance}>{formatNaira(w.totalCollected)}</Text>
                    <Text style={styles.eodCardLabel}>
                      {w.ownerIsActive ? '⚠️ Requires payment processor setup' : '⚠️ Organization inactive'}
                    </Text>
                  </View>
                  <Switch
                    value={w.ownerIsActive ? w.isClearingEnabled : false}
                    disabled={true}
                    trackColor={{ false: theme.colors.separator, true: theme.colors.primary }}
                    thumbColor={theme.colors.white}
                  />
                </View>
              ))}
          </>
        )}

        <TouchableOpacity
          style={styles.verifyRow}
          onPress={() => router.push('/(public)/lookup')}
          activeOpacity={0.7}
        >
          <Search size={20} color={theme.colors.primary} />
          <Text style={styles.verifyRowText}>Verify Trip Payment</Text>
          <ChevronRight size={16} color={theme.colors.grey1} />
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
      </SlideUpList>

      {/* ── Unified Edit Vehicle Type Modal ── */}
      <Modal
        visible={editVtModal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditVtModal(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {editVtModal ? `Edit ${editVtModal.vehicleTypeName}` : 'Edit Vehicle Type'}
            </Text>
            <TouchableOpacity onPress={() => setEditVtModal(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Vehicle Type Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Flatbed Truck"
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="words"
              value={editVtModal?.name ?? ''}
              onChangeText={(v) => setEditVtModal((prev) => prev ? { ...prev, name: v } : null)}
            />
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Loading Fee (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2800.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={editVtModal?.loadingFee ?? ''}
              onChangeText={(v) => setEditVtModal((prev) => prev ? { ...prev, loadingFee: v } : null)}
            />
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Unloading Fee (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2800.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={editVtModal?.unloadingFee ?? ''}
              onChangeText={(v) => setEditVtModal((prev) => prev ? { ...prev, unloadingFee: v } : null)}
            />
            {(editVtModal?.stakeholderRates ?? []).length > 0 && (
              <>
                <Text style={styles.modalSectionLabel}>Stakeholder Rates</Text>
                {(editVtModal?.stakeholderRates ?? []).map((sr, idx) => (
                  <View key={sr.stakeholderId}>
                    <Text style={styles.fieldLabel}>{sr.stakeholderName} (₦)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.placeholder}
                      keyboardType="decimal-pad"
                      value={sr.amount}
                      onChangeText={(v) =>
                        setEditVtModal((prev) => {
                          if (!prev) return null;
                          const updated = [...prev.stakeholderRates];
                          updated[idx] = { ...updated[idx]!, amount: v };
                          return { ...prev, stakeholderRates: updated };
                        })
                      }
                    />
                  </View>
                ))}
              </>
            )}
            {editVtError && <Text style={styles.errorText}>{editVtError}</Text>}
            <TouchableOpacity
              style={[styles.submitButton, editVtSubmitting && styles.buttonDisabled]}
              onPress={handleSubmitEditVt}
              disabled={editVtSubmitting}
              activeOpacity={0.85}
            >
              {editVtSubmitting
                ? <ActivityIndicator color={theme.colors.white} />
                : <Text style={styles.submitButtonText}>Save Changes</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Vehicle Type Modal ── */}
      <Modal
        visible={addVtVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddVtVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Vehicle Type</Text>
            <TouchableOpacity onPress={() => setAddVtVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Vehicle Type Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Heavy Duty 6/8 Tyres"
              placeholderTextColor={theme.colors.placeholder}
              value={addVtName}
              onChangeText={setAddVtName}
              autoCorrect={false}
            />
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Loading Fee (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2800.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={addVtLoadingFee}
              onChangeText={setAddVtLoadingFee}
            />
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Unloading Fee (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2800.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={addVtUnloadingFee}
              onChangeText={setAddVtUnloadingFee}
            />
            {addVtStakeholderRates.length > 0 && (
              <>
                <Text style={styles.modalSectionLabel}>Stakeholder Rates</Text>
                {addVtStakeholderRates.map((sr, idx) => (
                  <View key={sr.stakeholderId}>
                    <Text style={styles.fieldLabel}>{sr.stakeholderName} (₦)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.placeholder}
                      keyboardType="decimal-pad"
                      value={sr.amount}
                      onChangeText={(v) => {
                        const updated = [...addVtStakeholderRates];
                        updated[idx] = { ...updated[idx]!, amount: v };
                        setAddVtStakeholderRates(updated);
                      }}
                    />
                  </View>
                ))}
              </>
            )}
            {addVtError && <Text style={styles.errorText}>{addVtError}</Text>}
            <TouchableOpacity
              style={[styles.submitButton, addVtSubmitting && styles.buttonDisabled]}
              onPress={handleSubmitAddVt}
              disabled={addVtSubmitting}
              activeOpacity={0.85}
            >
              {addVtSubmitting
                ? <ActivityIndicator color={theme.colors.white} />
                : <Text style={styles.submitButtonText}>Create Vehicle Type</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      </ScreenTransition>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: theme.PILL_NAV_BOTTOM_PADDING },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  sectionLabel: {
    ...theme.typography.sectionLabel,
    marginTop: 20,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  card: {
    backgroundColor: theme.colors.white,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    ...theme.shadows.card,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: theme.colors.grey1,
    textTransform: 'uppercase',
  },
  activeBadge: {
    backgroundColor: theme.colors.greenMuted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.greenText,
    letterSpacing: 0.5,
  },
  typeRateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeRateHeaderMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  editIconBtn: {
    paddingLeft: 10,
    paddingVertical: 12,
  },
  toggleIconBtn: {
    paddingLeft: 16,
  },
  inactiveTypeRow: {
    opacity: 0.55,
  },
  typeRateNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mutedText: {
    color: theme.colors.grey1,
  },
  inactiveBadge: {
    backgroundColor: theme.colors.grey3,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inactiveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.grey1,
    letterSpacing: 0.5,
  },
  typeRateName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
  },
  vehicleTypeTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
    marginRight: 8,
  },
  typeRateBody: {
    paddingBottom: 8,
    paddingLeft: 4,
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
  emptyCard: {
    marginHorizontal: 20,
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    ...theme.shadows.card,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.grey1,
  },
  emptyRatesText: {
    fontSize: 14,
    color: theme.colors.grey1,
    marginBottom: 4,
  },
  addVtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: theme.colors.blueMuted,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addVtText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
    marginBottom: 6,
  },
  modalSectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.black,
    marginTop: 20,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: theme.colors.black,
    marginBottom: 4,
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  submitButtonText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.6 },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    marginTop: 10,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: theme.colors.white, fontWeight: '600', fontSize: 14 },
  bottomSpacer: { height: 24 },
  eodControlsRow: {
    marginHorizontal: 20,
    marginBottom: 10,
  },
  eodSearchInput: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.black,
  },
  eodFilterRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  eodFilterBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.grey4,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  eodFilterBtnActive: {
    backgroundColor: theme.colors.blueMuted,
    borderColor: theme.colors.primary,
  },
  eodFilterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  eodFilterBtnTextActive: {
    color: theme.colors.primary,
  },
  eodCardInactive: {
    opacity: 0.5,
  },
  eodCardLabel: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 4,
  },
  eodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 20,
    ...theme.shadows.card,
  },
  eodCardLeft: {
    flex: 1,
    marginRight: 12,
  },
  eodStateName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 4,
  },
  eodBalance: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 28,
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...theme.shadows.card,
  },
  verifyRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.black,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
    backgroundColor: theme.colors.white,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.black,
    flex: 1,
    marginRight: 12,
  },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 20 },
});
