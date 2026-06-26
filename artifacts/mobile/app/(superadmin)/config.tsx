import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronDown, ChevronRight, ChevronUp, Pencil, Plus, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  getActivePricingChart,
  addStakeholderRate,
  listVehicleTypes,
  updateVehicleType,
  updateStakeholderRate,
  createVehicleType,
} from '@/services/api';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import ScreenTransition from '@/components/ScreenTransition';
import SlideUpList from '@/components/SlideUpList';
import { formatNaira } from '@/utils/formatCurrency';

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

interface UnassignedStakeholder {
  id: string;
  name: string;
}

interface PricingChart {
  id: string;
  isActive: boolean;
  vehicleTypeRates: VehicleTypeRate[];
  unassignedStakeholders: UnassignedStakeholder[];
}

interface VehicleTypeItem {
  id: string;
  name: string;
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
  onEditVehicleType,
  onEditStakeholderRate,
}: {
  chart: PricingChart;
  onEditVehicleType: (vtr: VehicleTypeRate) => void;
  onEditStakeholderRate: (vtr: VehicleTypeRate, sr: VehicleTypeStakeholderRate) => void;
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
            <View key={vtr.vehicleTypeId}>
              {idx > 0 && <View style={styles.divider} />}
              <View style={styles.typeRateHeaderRow}>
                <TouchableOpacity
                  style={styles.typeRateHeaderMain}
                  onPress={() => setExpandedTypeId(expanded ? null : vtr.vehicleTypeId)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeRateName}>{vtr.vehicleTypeName}</Text>
                  {expanded
                    ? <ChevronUp size={16} color={theme.colors.grey1} />
                    : <ChevronDown size={16} color={theme.colors.grey1} />}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onEditVehicleType(vtr)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.editIconBtn}
                >
                  <Pencil size={15} color={theme.colors.primary} />
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
                          <View style={styles.srValueRow}>
                            <Text style={styles.feeValue}>{formatNaira(sr.amount)}</Text>
                            <TouchableOpacity
                              onPress={() => onEditStakeholderRate(vtr, sr)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Pencil size={13} color={theme.colors.grey1} />
                            </TouchableOpacity>
                          </View>
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
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<PricingChart | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeItem[]>([]);

  // Existing: set rate for unassigned stakeholder
  const [setRateModalVisible, setSetRateModalVisible] = useState(false);
  const [setRateStakeholder, setSetRateStakeholder] = useState<UnassignedStakeholder | null>(null);
  const [setRateVehicleTypeId, setSetRateVehicleTypeId] = useState<string>('');
  const [setRateAmount, setSetRateAmount] = useState('');
  const [setRateSubmitting, setSetRateSubmitting] = useState(false);
  const [setRateError, setSetRateError] = useState<string | null>(null);

  // Fix 6: edit vehicle type fees modal
  const [editVtData, setEditVtData] = useState<{
    vehicleTypeId: string;
    vehicleTypeName: string;
    loadingFee: string;
    unloadingFee: string;
  } | null>(null);
  const [editVtSubmitting, setEditVtSubmitting] = useState(false);
  const [editVtError, setEditVtError] = useState<string | null>(null);

  // Fix 7: edit stakeholder rate modal
  const [editSrData, setEditSrData] = useState<{
    chartId: string;
    stakeholderId: string;
    stakeholderName: string;
    vehicleTypeId: string;
    vehicleTypeName: string;
    amount: string;
  } | null>(null);
  const [editSrSubmitting, setEditSrSubmitting] = useState(false);
  const [editSrError, setEditSrError] = useState<string | null>(null);

  // Fix 8: add vehicle type modal
  const [addVtVisible, setAddVtVisible] = useState(false);
  const [addVtName, setAddVtName] = useState('');
  const [addVtLoadingFee, setAddVtLoadingFee] = useState('');
  const [addVtUnloadingFee, setAddVtUnloadingFee] = useState('');
  const [addVtSubmitting, setAddVtSubmitting] = useState(false);
  const [addVtError, setAddVtError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setPageError(null);
    try {
      const [chartResult, vehicleTypesResult] = await Promise.allSettled([
        getActivePricingChart(),
        listVehicleTypes(),
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
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openSetRateModal = (sh: UnassignedStakeholder) => {
    setSetRateStakeholder(sh);
    setSetRateVehicleTypeId('');
    setSetRateAmount('');
    setSetRateError(null);
    setSetRateModalVisible(true);
  };

  const handleSetRate = async () => {
    if (!setRateStakeholder || !activeChart) return;
    if (!setRateVehicleTypeId) {
      setSetRateError('Please select a vehicle type.');
      return;
    }
    if (!isValidNaira(setRateAmount)) {
      setSetRateError('Please enter a valid amount greater than zero.');
      return;
    }
    setSetRateSubmitting(true);
    setSetRateError(null);
    try {
      await addStakeholderRate(activeChart.id, {
        stakeholderId: setRateStakeholder.id,
        vehicleTypeId: setRateVehicleTypeId,
        amount: nairaToKobo(setRateAmount),
      });
      setSetRateModalVisible(false);
      setPageLoading(true);
      await loadData();
    } catch (e: any) {
      setSetRateError(e?.message ?? 'Failed to set rate.');
    } finally {
      setSetRateSubmitting(false);
    }
  };

  // Fix 6: edit vehicle type fees
  const handleOpenEditVt = (vtr: VehicleTypeRate) => {
    setEditVtData({
      vehicleTypeId: vtr.vehicleTypeId,
      vehicleTypeName: vtr.vehicleTypeName,
      loadingFee: (vtr.loadingFee / 100).toFixed(2),
      unloadingFee: (vtr.unloadingFee / 100).toFixed(2),
    });
    setEditVtError(null);
  };

  const handleSubmitEditVt = async () => {
    if (!editVtData) return;
    if (!isValidNaira(editVtData.loadingFee)) {
      setEditVtError('Enter a valid loading fee greater than zero.');
      return;
    }
    if (!isValidNaira(editVtData.unloadingFee)) {
      setEditVtError('Enter a valid unloading fee greater than zero.');
      return;
    }
    setEditVtSubmitting(true);
    setEditVtError(null);
    try {
      await updateVehicleType(editVtData.vehicleTypeId, {
        loadingFee: nairaToKobo(editVtData.loadingFee),
        unloadingFee: nairaToKobo(editVtData.unloadingFee),
      });
      setEditVtData(null);
      setPageLoading(true);
      await loadData();
    } catch (e: any) {
      setEditVtError(e?.message ?? 'Failed to update fees.');
    } finally {
      setEditVtSubmitting(false);
    }
  };

  // Fix 7: edit stakeholder rate
  const handleOpenEditSr = (vtr: VehicleTypeRate, sr: VehicleTypeStakeholderRate) => {
    if (!activeChart) return;
    setEditSrData({
      chartId: activeChart.id,
      stakeholderId: sr.stakeholderId,
      stakeholderName: sr.stakeholderName,
      vehicleTypeId: vtr.vehicleTypeId,
      vehicleTypeName: vtr.vehicleTypeName,
      amount: (sr.amount / 100).toFixed(2),
    });
    setEditSrError(null);
  };

  const handleSubmitEditSr = async () => {
    if (!editSrData) return;
    if (!isValidAmount(editSrData.amount)) {
      setEditSrError('Enter a valid amount (₦0 or more).');
      return;
    }
    setEditSrSubmitting(true);
    setEditSrError(null);
    try {
      await updateStakeholderRate(editSrData.chartId, {
        stakeholderId: editSrData.stakeholderId,
        vehicleTypeId: editSrData.vehicleTypeId,
        amount: nairaToKobo(editSrData.amount),
      });
      setEditSrData(null);
      setPageLoading(true);
      await loadData();
    } catch (e: any) {
      setEditSrError(e?.message ?? 'Failed to update rate.');
    } finally {
      setEditSrSubmitting(false);
    }
  };

  // Fix 8: add vehicle type
  const handleOpenAddVt = () => {
    setAddVtName('');
    setAddVtLoadingFee('');
    setAddVtUnloadingFee('');
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
    setAddVtSubmitting(true);
    setAddVtError(null);
    try {
      await createVehicleType({
        name: addVtName.trim(),
        loadingFee: nairaToKobo(addVtLoadingFee),
        unloadingFee: nairaToKobo(addVtUnloadingFee),
      });
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── Active chart ── */}
        <Text style={styles.sectionLabel}>Pricing Chart</Text>
        {activeChart ? (
          <ActiveChartCard
            chart={activeChart}
            onEditVehicleType={handleOpenEditVt}
            onEditStakeholderRate={handleOpenEditSr}
          />
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active pricing chart set</Text>
          </View>
        )}

        {/* Fix 8: Add Vehicle Type button */}
        <TouchableOpacity
          style={styles.addVtRow}
          onPress={handleOpenAddVt}
          activeOpacity={0.75}
        >
          <Plus size={18} color={theme.colors.primary} />
          <Text style={styles.addVtText}>Add Vehicle Type</Text>
        </TouchableOpacity>

        {/* ── Stakeholders Pending Rate ── */}
        {activeChart && (activeChart.unassignedStakeholders ?? []).length > 0 && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Stakeholders Pending Rate</Text>
            <View style={styles.card}>
              {(activeChart.unassignedStakeholders ?? []).map((sh, idx) => (
                <View key={sh.id}>
                  {idx > 0 && <View style={styles.divider} />}
                  <View style={styles.pendingRateRow}>
                    <Text style={styles.pendingRateName} numberOfLines={1}>{sh.name}</Text>
                    <TouchableOpacity
                      style={styles.setRateBtn}
                      onPress={() => openSetRateModal(sh)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.setRateBtnText}>Set Rate</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Verify Trip Payment ── */}
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

      {/* ── Set Rate Modal (unassigned stakeholder) ── */}
      <Modal
        visible={setRateModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSetRateModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Set Rate</Text>
            <TouchableOpacity onPress={() => setSetRateModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            {setRateStakeholder && (
              <Text style={styles.modalSubtitle}>{setRateStakeholder.name}</Text>
            )}
            <Text style={styles.fieldLabel}>Vehicle Type</Text>
            {vehicleTypes.map((vt) => {
              const selected = vt.id === setRateVehicleTypeId;
              return (
                <TouchableOpacity
                  key={vt.id}
                  style={[styles.typeRow, selected && styles.typeRowSelected]}
                  onPress={() => setSetRateVehicleTypeId(vt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeRowText, selected && styles.typeRowTextSelected]}>{vt.name}</Text>
                </TouchableOpacity>
              );
            })}
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Amount (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 500.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={setRateAmount}
              onChangeText={setSetRateAmount}
            />
            {setRateError && (
              <Text style={styles.errorText}>{setRateError}</Text>
            )}
            <TouchableOpacity
              style={[styles.submitButton, setRateSubmitting && styles.buttonDisabled]}
              onPress={handleSetRate}
              disabled={setRateSubmitting}
              activeOpacity={0.85}
            >
              {setRateSubmitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Confirm Rate</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Fix 6: Edit Vehicle Type Fees Modal ── */}
      <Modal
        visible={editVtData !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditVtData(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Fees</Text>
            <TouchableOpacity onPress={() => setEditVtData(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            {editVtData && (
              <Text style={styles.modalSubtitle}>{editVtData.vehicleTypeName}</Text>
            )}
            <Text style={styles.fieldLabel}>Loading Fee (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2800.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={editVtData?.loadingFee ?? ''}
              onChangeText={(v) => setEditVtData((prev) => prev ? { ...prev, loadingFee: v } : null)}
            />
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Unloading Fee (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2800.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={editVtData?.unloadingFee ?? ''}
              onChangeText={(v) => setEditVtData((prev) => prev ? { ...prev, unloadingFee: v } : null)}
            />
            {editVtError && (
              <Text style={styles.errorText}>{editVtError}</Text>
            )}
            <TouchableOpacity
              style={[styles.submitButton, editVtSubmitting && styles.buttonDisabled]}
              onPress={handleSubmitEditVt}
              disabled={editVtSubmitting}
              activeOpacity={0.85}
            >
              {editVtSubmitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Save Fees</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Fix 7: Edit Stakeholder Rate Modal ── */}
      <Modal
        visible={editSrData !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditSrData(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Rate</Text>
            <TouchableOpacity onPress={() => setEditSrData(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            {editSrData && (
              <>
                <Text style={styles.modalSubtitle}>{editSrData.stakeholderName}</Text>
                <Text style={[styles.fieldLabel, { marginBottom: 14 }]}>
                  Vehicle Type: {editSrData.vehicleTypeName}
                </Text>
              </>
            )}
            <Text style={styles.fieldLabel}>Amount (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 500.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={editSrData?.amount ?? ''}
              onChangeText={(v) => setEditSrData((prev) => prev ? { ...prev, amount: v } : null)}
            />
            {editSrError && (
              <Text style={styles.errorText}>{editSrError}</Text>
            )}
            <TouchableOpacity
              style={[styles.submitButton, editSrSubmitting && styles.buttonDisabled]}
              onPress={handleSubmitEditSr}
              disabled={editSrSubmitting}
              activeOpacity={0.85}
            >
              {editSrSubmitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Save Rate</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Fix 8: Add Vehicle Type Modal ── */}
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
            {addVtError && (
              <Text style={styles.errorText}>{addVtError}</Text>
            )}
            <TouchableOpacity
              style={[styles.submitButton, addVtSubmitting && styles.buttonDisabled]}
              onPress={handleSubmitAddVt}
              disabled={addVtSubmitting}
              activeOpacity={0.85}
            >
              {addVtSubmitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Create Vehicle Type</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      </ScreenTransition>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
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
  sectionLabelSpaced: { marginTop: 28 },
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
  typeRateName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
    flex: 1,
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
  srValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  input: {
    backgroundColor: theme.colors.grey4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
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
  pendingRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  pendingRateName: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.black,
    fontWeight: '500',
    marginRight: 12,
  },
  setRateBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  setRateBtnText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: '700',
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
  },
  modalSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.grey2,
    marginBottom: 20,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
  },
  typeRow: {
    backgroundColor: theme.colors.grey4,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
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
});
