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
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  getActivePricingChart,
  createPricingChart,
  activatePricingChart,
  addStakeholderRate,
  getStakeholders,
  getStates,
  updateStateRates,
} from '@/services/api';
import type { Stakeholder } from '@/types/index';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import { formatNaira } from '@/utils/formatCurrency';

interface StakeholderRate {
  id: string;
  stakeholder_id: string;
  stakeholder_name: string;
  amount: number;
}

interface UnassignedStakeholder {
  id: string;
  name: string;
}

interface PricingChart {
  id: string;
  loading_fee: number;
  unloading_fee: number;
  is_active: boolean;
  created_at: string;
  stakeholder_rates: StakeholderRate[];
  unassignedStakeholders?: UnassignedStakeholder[];
}

interface StateRateItem {
  id: string;
  name: string;
  code: string;
  loadingRate: number;
  unloadingRate: number;
}

function nairaToKobo(val: string): number {
  return Math.round(parseFloat(val) * 100);
}

function isValidNaira(val: string): boolean {
  const n = parseFloat(val);
  return val.trim() !== '' && !isNaN(n) && n > 0;
}

function ActiveChartCard({ chart }: { chart: PricingChart }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>ACTIVE PRICING CHART</Text>
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>ACTIVE</Text>
        </View>
      </View>
      {chart.stakeholder_rates.length > 0 ? (
        <>
          <Text style={styles.subLabel}>STAKEHOLDER RATES</Text>
          {chart.stakeholder_rates.map((r) => (
            <View key={r.id} style={styles.feeRow}>
              <Text style={styles.feeLabel}>{r.stakeholder_name}</Text>
              <Text style={styles.feeValue}>{formatNaira(r.amount)}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.emptyRatesText}>No stakeholder rates configured</Text>
      )}
    </View>
  );
}

function PendingChartCard({
  chart,
  onActivate,
  activating,
}: {
  chart: PricingChart;
  onActivate: () => void;
  activating: boolean;
}) {
  return (
    <View style={[styles.card, styles.pendingCard]}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>NEW CHART (INACTIVE)</Text>
        <View style={styles.inactiveBadge}>
          <Text style={styles.inactiveBadgeText}>INACTIVE</Text>
        </View>
      </View>
      {chart.stakeholder_rates.length > 0 ? (
        <>
          <Text style={styles.subLabel}>STAKEHOLDER RATES</Text>
          {chart.stakeholder_rates.map((r) => (
            <View key={r.id} style={styles.feeRow}>
              <Text style={styles.feeLabel}>{r.stakeholder_name ?? r.stakeholder_id}</Text>
              <Text style={styles.feeValue}>{formatNaira(r.amount)}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.emptyRatesText}>No stakeholder rates configured</Text>
      )}
      <TouchableOpacity
        style={[styles.activateButton, activating && styles.buttonDisabled]}
        onPress={onActivate}
        disabled={activating}
        activeOpacity={0.85}
      >
        {activating ? (
          <ActivityIndicator color={theme.colors.white} />
        ) : (
          <Text style={styles.activateButtonText}>Activate This Chart</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function ConfigScreen() {
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<PricingChart | null>(null);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [newChart, setNewChart] = useState<PricingChart | null>(null);
  const [stateRates, setStateRates] = useState<StateRateItem[]>([]);

  const [stakeholderInputs, setStakeholderInputs] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [editingStateId, setEditingStateId] = useState<string | null>(null);
  const [editLoadingRate, setEditLoadingRate] = useState('');
  const [editUnloadingRate, setEditUnloadingRate] = useState('');
  const [savingStateId, setSavingStateId] = useState<string | null>(null);
  const [stateRateError, setStateRateError] = useState<string | null>(null);

  const [pendingRateModalVisible, setPendingRateModalVisible] = useState(false);
  const [selectedUnassignedSh, setSelectedUnassignedSh] = useState<{ id: string; name: string } | null>(null);
  const [pendingRateInput, setPendingRateInput] = useState('');
  const [pendingRateError, setPendingRateError] = useState<string | null>(null);
  const [pendingRateSaving, setPendingRateSaving] = useState(false);
  const [stateSearch, setStateSearch] = useState('');

  const [setRateModalVisible, setSetRateModalVisible] = useState(false);
  const [setRateStakeholder, setSetRateStakeholder] = useState<UnassignedStakeholder | null>(null);
  const [setRateAmount, setSetRateAmount] = useState('');
  const [setRateSubmitting, setSetRateSubmitting] = useState(false);
  const [setRateError, setSetRateError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setPageError(null);
    try {
      const [chartResult, stakeholdersResult, statesResult] = await Promise.allSettled([
        getActivePricingChart(),
        getStakeholders(),
        getStates(),
      ]);

      if (chartResult.status === 'fulfilled') {
        setActiveChart(chartResult.value?.chart ?? null);
      } else if ((chartResult.reason as any)?.error !== 'NOT_FOUND') {
        setPageError('Failed to load pricing data');
        return;
      } else {
        setActiveChart(null);
      }

      if (stakeholdersResult.status === 'fulfilled') {
        const list: Stakeholder[] = stakeholdersResult.value?.stakeholders ?? [];
        setStakeholders(list.filter((s) => s.isActive));
      } else {
        setPageError('Failed to load stakeholders');
      }

      if (statesResult.status === 'fulfilled') {
        setStateRates((statesResult.value?.states ?? []) as StateRateItem[]);
      }
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openPendingRateModal = (sh: { id: string; name: string }) => {
    setSelectedUnassignedSh(sh);
    setPendingRateInput('');
    setPendingRateError(null);
    setPendingRateSaving(false);
    setPendingRateModalVisible(true);
  };

  const handleSetStakeholderRate = async () => {
    if (!activeChart || !selectedUnassignedSh) return;
    if (!isValidNaira(pendingRateInput)) {
      setPendingRateError('Enter a valid amount greater than zero.');
      return;
    }
    setPendingRateSaving(true);
    setPendingRateError(null);
    try {
      await addStakeholderRate(activeChart.id, {
        stakeholderId: selectedUnassignedSh.id,
        amount: nairaToKobo(pendingRateInput),
      });
      setPendingRateModalVisible(false);
      const refreshed = await getActivePricingChart();
      setActiveChart(refreshed?.chart ?? null);
    } catch (e: any) {
      setPendingRateError(e?.message ?? 'Failed to set rate.');
    } finally {
      setPendingRateSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    for (const sh of stakeholders) {
      const val = stakeholderInputs[sh.id] ?? '';
      if (val.trim() !== '' && !isValidNaira(val)) {
        setSubmitError(`Rate for ${sh.name} must be greater than zero.`);
        return;
      }
    }

    const stakeholderRates = stakeholders
      .filter((sh) => isValidNaira(stakeholderInputs[sh.id] ?? ''))
      .map((sh) => ({
        stakeholder_id: sh.id,
        amount: nairaToKobo(stakeholderInputs[sh.id]!),
      }));

    setSubmitting(true);
    try {
      const result = await createPricingChart({
        stakeholder_rates: stakeholderRates,
      });
      const created: PricingChart = result?.chart ?? result;
      setNewChart(created);
      setStakeholderInputs({});
    } catch (e: any) {
      setSubmitError(e?.message ?? 'Failed to create pricing chart.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (chartId: string) => {
    setActivating(true);
    try {
      const result = await activatePricingChart(chartId);
      const activated: PricingChart = result?.chart ?? result;
      setActiveChart(activated);
      setNewChart(null);
    } catch (e: any) {
      setSubmitError(e?.message ?? 'Failed to activate chart.');
    } finally {
      setActivating(false);
    }
  };

  const handleEditState = (s: StateRateItem) => {
    setEditingStateId(s.id);
    setEditLoadingRate((s.loadingRate / 100).toFixed(2));
    setEditUnloadingRate((s.unloadingRate / 100).toFixed(2));
    setStateRateError(null);
  };

  const openSetRateModal = (sh: UnassignedStakeholder) => {
    setSetRateStakeholder(sh);
    setSetRateAmount('');
    setSetRateError(null);
    setSetRateModalVisible(true);
  };

  const handleSetRate = async () => {
    if (!setRateStakeholder || !activeChart) return;
    if (!isValidNaira(setRateAmount)) {
      setSetRateError('Please enter a valid amount greater than zero.');
      return;
    }
    setSetRateSubmitting(true);
    setSetRateError(null);
    try {
      await addStakeholderRate(activeChart.id, {
        stakeholderId: setRateStakeholder.id,
        amount: nairaToKobo(setRateAmount),
      });
      setSetRateModalVisible(false);
      await loadData();
    } catch (e: any) {
      setSetRateError(e?.message ?? 'Failed to set rate.');
    } finally {
      setSetRateSubmitting(false);
    }
  };

  const handleSaveStateRate = async (stateId: string) => {
    if (!isValidNaira(editLoadingRate)) {
      setStateRateError('Loading rate must be greater than zero.');
      return;
    }
    if (!isValidNaira(editUnloadingRate)) {
      setStateRateError('Unloading rate must be greater than zero.');
      return;
    }
    setSavingStateId(stateId);
    setStateRateError(null);
    try {
      const result = await updateStateRates(stateId, {
        loadingRate: nairaToKobo(editLoadingRate),
        unloadingRate: nairaToKobo(editUnloadingRate),
      });
      const updated = result?.state as StateRateItem;
      setStateRates((prev) =>
        prev.map((s) => (s.id === stateId ? { ...s, loadingRate: updated.loadingRate, unloadingRate: updated.unloadingRate } : s))
      );
      setEditingStateId(null);
    } catch (e: any) {
      setStateRateError(e?.message ?? 'Failed to save state rates.');
    } finally {
      setSavingStateId(null);
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={96}
      >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── State Rates ── */}
        <Text style={styles.sectionLabel}>State Loading & Unloading Rates</Text>
        <TextInput
          style={styles.stateSearchInput}
          placeholder="Search states…"
          placeholderTextColor={theme.colors.placeholder}
          value={stateSearch}
          onChangeText={setStateSearch}
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {stateRates.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Loading state rates…</Text>
          </View>
        ) : (
          <View style={styles.stateRatesCard}>
            {stateRates
              .filter((s) =>
                stateSearch.trim() === '' ||
                s.name.toLowerCase().includes(stateSearch.trim().toLowerCase()) ||
                s.code.toLowerCase().includes(stateSearch.trim().toLowerCase())
              )
              .map((s, idx) => (
              <View key={s.id}>
                {idx > 0 && <View style={styles.rowDivider} />}
                {editingStateId === s.id ? (
                  <View style={styles.stateEditBlock}>
                    <Text style={styles.stateEditName}>{s.name}</Text>
                    <View style={styles.stateEditRow}>
                      <View style={styles.stateEditField}>
                        <Text style={styles.fieldLabel}>Loading (₦)</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="0.00"
                          placeholderTextColor={theme.colors.placeholder}
                          keyboardType="decimal-pad"
                          value={editLoadingRate}
                          onChangeText={setEditLoadingRate}
                        />
                      </View>
                      <View style={{ width: 10 }} />
                      <View style={styles.stateEditField}>
                        <Text style={styles.fieldLabel}>Unloading (₦)</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="0.00"
                          placeholderTextColor={theme.colors.placeholder}
                          keyboardType="decimal-pad"
                          value={editUnloadingRate}
                          onChangeText={setEditUnloadingRate}
                        />
                      </View>
                    </View>
                    {stateRateError && (
                      <Text style={styles.errorText}>{stateRateError}</Text>
                    )}
                    <View style={styles.stateEditActions}>
                      <TouchableOpacity
                        style={styles.cancelEditBtn}
                        onPress={() => setEditingStateId(null)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cancelEditBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.saveEditBtn, savingStateId === s.id && styles.buttonDisabled]}
                        onPress={() => handleSaveStateRate(s.id)}
                        disabled={savingStateId === s.id}
                        activeOpacity={0.85}
                      >
                        {savingStateId === s.id ? (
                          <ActivityIndicator color={theme.colors.white} size="small" />
                        ) : (
                          <Text style={styles.saveEditBtnText}>Save</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.stateRateRow}>
                    <Text style={styles.stateRateName} numberOfLines={1}>{s.name}</Text>
                    <View style={styles.stateRateValues}>
                      <View style={styles.stateRateValueGroup}>
                        <Text style={styles.stateRateValueLabel}>Load</Text>
                        <Text style={styles.stateRateValue}>{formatNaira(s.loadingRate)}</Text>
                      </View>
                      <View style={styles.stateRateValueGroup}>
                        <Text style={styles.stateRateValueLabel}>Unload</Text>
                        <Text style={styles.stateRateValue}>{formatNaira(s.unloadingRate)}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleEditState(s)}
                        style={styles.editStateBtn}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="pencil-outline" size={15} color={theme.colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Active chart ── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Stakeholder Rate Chart</Text>
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

        {/* ── Pending newly created chart ── */}
        {newChart && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Pending Chart</Text>
            <PendingChartCard
              chart={newChart}
              onActivate={() => handleActivate(newChart.id)}
              activating={activating}
            />
          </>
        )}

        {/* ── Create new chart form ── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Create New Chart</Text>
        <View style={styles.card}>
          {stakeholders.length > 0 ? (
            <>
              <Text style={styles.subLabel}>STAKEHOLDER RATES (₦)</Text>
              {stakeholders.map((sh) => (
                <View key={sh.id}>
                  <Text style={styles.fieldLabel}>{sh.name}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00 (leave blank to exclude)"
                    placeholderTextColor={theme.colors.placeholder}
                    keyboardType="decimal-pad"
                    value={stakeholderInputs[sh.id] ?? ''}
                    onChangeText={(v) =>
                      setStakeholderInputs((prev) => ({ ...prev, [sh.id]: v }))
                    }
                  />
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.emptyRatesText}>No active stakeholders configured</Text>
          )}

          {submitError ? (
            <Text style={styles.errorText}>{submitError}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Create Chart</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Verify Trip Payment ── */}
        <TouchableOpacity
          style={styles.verifyRow}
          onPress={() => router.push('/(public)/lookup')}
          activeOpacity={0.7}
        >
          <Ionicons name="search-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.verifyRowText}>Verify Trip Payment</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.grey1} />
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>

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
              <Ionicons name="close" size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            {setRateStakeholder && (
              <Text style={styles.modalSubtitle}>{setRateStakeholder.name}</Text>
            )}
            <Text style={styles.fieldLabel}>Amount (₦)</Text>
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
  pendingCard: {
    borderWidth: 1,
    borderColor: theme.colors.inactive,
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
  inactiveBadge: {
    backgroundColor: theme.colors.grey3,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.grey1,
    letterSpacing: 0.5,
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
    marginVertical: 12,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: theme.colors.grey1,
    textTransform: 'uppercase',
    marginBottom: 8,
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
  activateButton: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  activateButtonText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '700',
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

  // ── State rates ──────────────────────────────────────────────────────────────
  stateSearchInput: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: theme.colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: theme.colors.black,
  },
  stateRatesCard: {
    backgroundColor: theme.colors.white,
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 4,
    ...theme.shadows.card,
    overflow: 'hidden',
  },
  rowDivider: {
    height: 1,
    backgroundColor: theme.colors.separator,
    marginHorizontal: 16,
  },
  stateRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stateRateName: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.black,
    fontWeight: '500',
  },
  stateRateValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stateRateValueGroup: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  stateRateValueLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.grey1,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  stateRateValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.black,
  },
  editStateBtn: {
    padding: 6,
    marginLeft: 4,
  },
  stateEditBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stateEditName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
    marginBottom: 10,
  },
  stateEditRow: {
    flexDirection: 'row',
  },
  stateEditField: {
    flex: 1,
  },
  stateEditActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  cancelEditBtn: {
    flex: 1,
    backgroundColor: theme.colors.grey4,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cancelEditBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  saveEditBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  saveEditBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.white,
  },
  // ── Pending rate section ──────────────────────────────────────────────────
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

  // ── Set Rate Modal ────────────────────────────────────────────────────────
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
});
