import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { getActivePricingChart, createPricingChart, activatePricingChart, getStakeholders } from '@/services/api';
import type { Stakeholder } from '@/types/index';
import { theme } from '@/constants/theme';
import { formatNaira } from '@/utils/formatCurrency';

interface StakeholderRate {
  id: string;
  stakeholder_id: string;
  stakeholder_name: string;
  amount: number;
}

interface PricingChart {
  id: string;
  loading_fee: number;
  unloading_fee: number;
  is_active: boolean;
  created_at: string;
  stakeholder_rates: StakeholderRate[];
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
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>Loading Fee</Text>
        <Text style={styles.feeValue}>{formatNaira(chart.loading_fee)}</Text>
      </View>
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>Unloading Fee</Text>
        <Text style={styles.feeValue}>{formatNaira(chart.unloading_fee)}</Text>
      </View>
      {chart.stakeholder_rates.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.subLabel}>STAKEHOLDER RATES</Text>
          {chart.stakeholder_rates.map((r) => (
            <View key={r.id} style={styles.feeRow}>
              <Text style={styles.feeLabel}>{r.stakeholder_name}</Text>
              <Text style={styles.feeValue}>{formatNaira(r.amount)}</Text>
            </View>
          ))}
        </>
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
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>Loading Fee</Text>
        <Text style={styles.feeValue}>{formatNaira(chart.loading_fee)}</Text>
      </View>
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>Unloading Fee</Text>
        <Text style={styles.feeValue}>{formatNaira(chart.unloading_fee)}</Text>
      </View>
      {chart.stakeholder_rates.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.subLabel}>STAKEHOLDER RATES</Text>
          {chart.stakeholder_rates.map((r) => (
            <View key={r.id} style={styles.feeRow}>
              <Text style={styles.feeLabel}>{r.stakeholder_name ?? r.stakeholder_id}</Text>
              <Text style={styles.feeValue}>{formatNaira(r.amount)}</Text>
            </View>
          ))}
        </>
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

  const [loadingFeeInput, setLoadingFeeInput] = useState('');
  const [unloadingFeeInput, setUnloadingFeeInput] = useState('');
  const [stakeholderInputs, setStakeholderInputs] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setPageError(null);
    try {
      const [chartResult, stakeholdersResult] = await Promise.allSettled([
        getActivePricingChart(),
        getStakeholders(),
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
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!isValidNaira(loadingFeeInput)) {
      setSubmitError('Loading fee must be greater than zero.');
      return;
    }
    if (!isValidNaira(unloadingFeeInput)) {
      setSubmitError('Unloading fee must be greater than zero.');
      return;
    }
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
        loading_fee: nairaToKobo(loadingFeeInput),
        unloading_fee: nairaToKobo(unloadingFeeInput),
        stakeholder_rates: stakeholderRates,
      });
      const created: PricingChart = result?.chart ?? result;
      setNewChart(created);
      setLoadingFeeInput('');
      setUnloadingFeeInput('');
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={96}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── Active chart ── */}
        <Text style={styles.sectionLabel}>Current Active Chart</Text>
        {activeChart ? (
          <ActiveChartCard chart={activeChart} />
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active pricing chart set</Text>
          </View>
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
          <Text style={styles.fieldLabel}>Loading Fee (₦)</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={theme.colors.placeholder}
            keyboardType="decimal-pad"
            value={loadingFeeInput}
            onChangeText={setLoadingFeeInput}
          />

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Unloading Fee (₦)</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={theme.colors.placeholder}
            keyboardType="decimal-pad"
            value={unloadingFeeInput}
            onChangeText={setUnloadingFeeInput}
          />

          {stakeholders.length > 0 && (
            <>
              <View style={styles.divider} />
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
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
    marginBottom: 6,
  },
  fieldLabelSpaced: { marginTop: 12 },
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
});
