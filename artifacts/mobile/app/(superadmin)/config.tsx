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
import { ChevronDown, ChevronRight, ChevronUp, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  getActivePricingChart,
  addStakeholderRate,
  listVehicleTypes,
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

function ActiveChartCard({ chart }: { chart: PricingChart }) {
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
              <TouchableOpacity
                style={styles.typeRateHeader}
                onPress={() => setExpandedTypeId(expanded ? null : vtr.vehicleTypeId)}
                activeOpacity={0.7}
              >
                <Text style={styles.typeRateName}>{vtr.vehicleTypeName}</Text>
                {expanded
                  ? <ChevronUp size={16} color={theme.colors.grey1} />
                  : <ChevronDown size={16} color={theme.colors.grey1} />}
              </TouchableOpacity>
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
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<PricingChart | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeItem[]>([]);

  const [setRateModalVisible, setSetRateModalVisible] = useState(false);
  const [setRateStakeholder, setSetRateStakeholder] = useState<UnassignedStakeholder | null>(null);
  const [setRateVehicleTypeId, setSetRateVehicleTypeId] = useState<string>('');
  const [setRateAmount, setSetRateAmount] = useState('');
  const [setRateSubmitting, setSetRateSubmitting] = useState(false);
  const [setRateError, setSetRateError] = useState<string | null>(null);

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
          <ActiveChartCard chart={activeChart} />
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active pricing chart set</Text>
          </View>
        )}

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

      {/* Set Rate Modal */}
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
  typeRateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
