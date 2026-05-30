import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '@/constants/theme';
import SearchablePicker, { PickerItem } from '@/components/SearchablePicker';
import { createTrip, getUsers, getStates, getStakeholders } from '@/services/api';
import { User, State, Stakeholder } from '@/types';

interface StakeholderRow {
  id: string;
  name: string;
  enabled: boolean;
  amount: string;
}

type PickerTarget = 'driver' | 'loadingState' | 'unloadingState' | null;

function nairaToKobo(val: string): number {
  return Math.round(parseFloat(val) * 100);
}

export default function CreateTripScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [drivers, setDrivers] = useState<PickerItem[]>([]);
  const [states, setStates] = useState<PickerItem[]>([]);
  const [stakeholderRows, setStakeholderRows] = useState<StakeholderRow[]>([]);

  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverLabel, setDriverLabel] = useState('');

  const [loadingStateId, setLoadingStateId] = useState<string | null>(null);
  const [loadingStateName, setLoadingStateName] = useState('');
  const [unloadingStateId, setUnloadingStateId] = useState<string | null>(null);
  const [unloadingStateName, setUnloadingStateName] = useState('');
  const [originDescription, setOriginDescription] = useState('');
  const [destinationDescription, setDestinationDescription] = useState('');

  const [loadingFee, setLoadingFee] = useState('');
  const [unloadingFee, setUnloadingFee] = useState('');

  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  useEffect(() => {
    Promise.all([getUsers(), getStates(), getStakeholders()])
      .then(([usersData, statesData, stakeholdersData]) => {
        const userList: User[] = usersData?.users ?? usersData ?? [];
        const driverItems: PickerItem[] = userList
          .filter((u) => u.role === 'driver')
          .map((u) => ({ id: u.id, label: u.email, sublabel: u.entityName ?? undefined }));
        setDrivers(driverItems);

        const stateList: State[] = statesData?.states ?? statesData ?? [];
        const stateItems: PickerItem[] = stateList.map((s) => ({
          id: s.id,
          label: s.name,
          sublabel: s.code,
        }));
        setStates(stateItems);

        const stakeholderList: Stakeholder[] =
          stakeholdersData?.stakeholders ?? stakeholdersData ?? [];
        const rows: StakeholderRow[] = stakeholderList
          .filter((s) => s.isActive)
          .map((s) => ({ id: s.id, name: s.name, enabled: false, amount: '' }));
        setStakeholderRows(rows);
      })
      .catch(() => {
        setApiError('Failed to load data. Please go back and try again.');
      })
      .finally(() => setLoading(false));
  }, []);

  function openPicker(target: PickerTarget) {
    setValidationError(null);
    setApiError(null);
    setPickerTarget(target);
  }

  function handleDriverSelect(item: PickerItem) {
    setDriverId(item.id);
    setDriverLabel(item.label);
  }

  function handleLoadingStateSelect(item: PickerItem) {
    setLoadingStateId(item.id);
    setLoadingStateName(item.label);
  }

  function handleUnloadingStateSelect(item: PickerItem) {
    setUnloadingStateId(item.id);
    setUnloadingStateName(item.label);
  }

  function toggleStakeholder(id: string, value: boolean) {
    setStakeholderRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, enabled: value, amount: value ? r.amount : '' } : r)),
    );
  }

  function setStakeholderAmount(id: string, value: string) {
    setStakeholderRows((rows) => rows.map((r) => (r.id === id ? { ...r, amount: value } : r)));
  }

  function validate(): string | null {
    if (!vehicleNumber.trim()) return 'Vehicle number is required.';
    if (!driverId) return 'Please select a driver.';
    if (!loadingStateId) return 'Please select a loading state.';
    if (!unloadingStateId) return 'Please select an unloading state.';
    if (!originDescription.trim()) return 'Origin description is required.';
    if (!destinationDescription.trim()) return 'Destination description is required.';
    if (!loadingFee.trim() || isNaN(parseFloat(loadingFee)) || parseFloat(loadingFee) <= 0)
      return 'Loading fee must be greater than zero.';
    if (!unloadingFee.trim() || isNaN(parseFloat(unloadingFee)) || parseFloat(unloadingFee) <= 0)
      return 'Unloading fee must be greater than zero.';
    for (const row of stakeholderRows) {
      if (row.enabled) {
        if (!row.amount.trim() || isNaN(parseFloat(row.amount)) || parseFloat(row.amount) <= 0)
          return `Fee for ${row.name} must be greater than zero.`;
      }
    }
    return null;
  }

  async function handleSubmit() {
    setValidationError(null);
    setApiError(null);

    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        driverId,
        loadingStateId,
        unloadingStateId,
        originDescription: originDescription.trim(),
        destinationDescription: destinationDescription.trim(),
        fees: {
          loadingFee: nairaToKobo(loadingFee),
          unloadingFee: nairaToKobo(unloadingFee),
          stakeholders: stakeholderRows.map((r) => ({
            stakeholderId: r.id,
            enabled: r.enabled,
            amount: r.enabled ? nairaToKobo(r.amount) : 0,
          })),
        },
      };

      const result = await createTrip(body);
      const tripId: string = result?.trip?.id ?? result?.id ?? result?.tripId ?? 'N/A';
      setSuccess(tripId);

      setTimeout(() => {
        router.back();
      }, 2000);
    } catch (e: any) {
      if (e?.error === 'CONFLICT' || e?.message?.toLowerCase().includes('active trip')) {
        setApiError('This vehicle already has an active trip.');
      } else {
        setApiError(e?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const pickerItems =
    pickerTarget === 'driver'
      ? drivers
      : pickerTarget === 'loadingState' || pickerTarget === 'unloadingState'
        ? states
        : [];

  const pickerSelectedId =
    pickerTarget === 'driver'
      ? driverId
      : pickerTarget === 'loadingState'
        ? loadingStateId
        : pickerTarget === 'unloadingState'
          ? unloadingStateId
          : null;

  const pickerTitle =
    pickerTarget === 'driver'
      ? 'Select Driver'
      : pickerTarget === 'loadingState'
        ? 'Select Loading State'
        : 'Select Unloading State';

  function handlePickerSelect(item: PickerItem) {
    if (pickerTarget === 'driver') handleDriverSelect(item);
    else if (pickerTarget === 'loadingState') handleLoadingStateSelect(item);
    else if (pickerTarget === 'unloadingState') handleUnloadingStateSelect(item);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (success !== null) {
    return (
      <View style={styles.centered}>
        <Ionicons name="checkmark-circle" size={64} color={theme.colors.green} />
        <Text style={styles.successTitle}>Trip Created Successfully</Text>
        <Text style={styles.successId}>Trip ID: {success}</Text>
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={96}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Card 1 — Vehicle & Driver */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vehicle & Driver</Text>

            <Text style={styles.fieldLabel}>Vehicle Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. ABC123XY"
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="characters"
              value={vehicleNumber}
              onChangeText={(t) => setVehicleNumber(t.toUpperCase())}
            />

            <Text style={styles.fieldLabel}>Driver</Text>
            <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('driver')}>
              <Text style={driverId ? styles.pickerText : styles.pickerPlaceholder}>
                {driverId ? driverLabel : 'Select driver…'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.grey1} />
            </TouchableOpacity>
          </View>

          {/* Card 2 — Route */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Route</Text>

            <Text style={styles.fieldLabel}>Loading State</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => openPicker('loadingState')}
            >
              <Text style={loadingStateId ? styles.pickerText : styles.pickerPlaceholder}>
                {loadingStateId ? loadingStateName : 'Select loading state…'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.grey1} />
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Unloading State</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => openPicker('unloadingState')}
            >
              <Text style={unloadingStateId ? styles.pickerText : styles.pickerPlaceholder}>
                {unloadingStateId ? unloadingStateName : 'Select unloading state…'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.grey1} />
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Origin</Text>
            <TextInput
              style={styles.input}
              placeholder="Origin description"
              placeholderTextColor={theme.colors.placeholder}
              value={originDescription}
              onChangeText={setOriginDescription}
            />

            <Text style={styles.fieldLabel}>Destination</Text>
            <TextInput
              style={styles.input}
              placeholder="Destination description"
              placeholderTextColor={theme.colors.placeholder}
              value={destinationDescription}
              onChangeText={setDestinationDescription}
            />
          </View>

          {/* Card 3 — State Fees */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>State Fees</Text>

            <Text style={styles.fieldLabel}>
              Loading Fee (₦){loadingStateName ? ` — ${loadingStateName}` : ''}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={loadingFee}
              onChangeText={setLoadingFee}
            />

            <Text style={styles.fieldLabel}>
              Unloading Fee (₦){unloadingStateName ? ` — ${unloadingStateName}` : ''}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="decimal-pad"
              value={unloadingFee}
              onChangeText={setUnloadingFee}
            />
          </View>

          {/* Card 4 — Stakeholder Fees */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Stakeholder Fees</Text>

            {stakeholderRows.length === 0 && (
              <Text style={styles.emptyStakeholders}>No active stakeholders found.</Text>
            )}

            {stakeholderRows.map((row, index) => (
              <View key={row.id}>
                {index > 0 && <View style={styles.stakeholderSeparator} />}
                <View style={styles.stakeholderRow}>
                  <View style={styles.stakeholderInfo}>
                    <Text style={styles.stakeholderName}>{row.name}</Text>
                    {row.enabled && (
                      <TextInput
                        style={styles.stakeholderInput}
                        placeholder="Amount (₦)"
                        placeholderTextColor={theme.colors.placeholder}
                        keyboardType="decimal-pad"
                        value={row.amount}
                        onChangeText={(v) => setStakeholderAmount(row.id, v)}
                      />
                    )}
                  </View>
                  <Switch
                    value={row.enabled}
                    onValueChange={(v) => toggleStakeholder(row.id, v)}
                    trackColor={{ false: theme.colors.inactive, true: theme.colors.primary }}
                    thumbColor={theme.colors.white}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Error + Submit */}
          {(validationError || apiError) && (
            <Text style={styles.errorText}>{validationError ?? apiError}</Text>
          )}

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Create Trip</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      <SearchablePicker
        visible={pickerTarget !== null}
        title={pickerTitle}
        items={pickerItems}
        selectedId={pickerSelectedId}
        onSelect={handlePickerSelect}
        onClose={() => setPickerTarget(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: theme.colors.grey1, fontSize: 15 },
  successTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.greenText, marginTop: 8 },
  successId: { fontSize: 14, color: theme.colors.grey1 },

  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...theme.shadows.card,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.colors.grey1,
    marginBottom: 14,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: theme.colors.grey4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: theme.colors.black,
  },
  pickerButton: {
    backgroundColor: theme.colors.grey4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: { fontSize: 15, color: theme.colors.black, flex: 1 },
  pickerPlaceholder: { fontSize: 15, color: theme.colors.placeholder, flex: 1 },

  stakeholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  stakeholderInfo: { flex: 1 },
  stakeholderName: { fontSize: 15, fontWeight: '500', color: theme.colors.black },
  stakeholderInput: {
    backgroundColor: theme.colors.grey4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.colors.black,
    marginTop: 8,
  },
  stakeholderSeparator: { height: 1, backgroundColor: theme.colors.separator },
  emptyStakeholders: { fontSize: 14, color: theme.colors.grey1, textAlign: 'center', paddingVertical: 12 },

  errorText: {
    fontSize: 14,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: theme.colors.white, fontSize: 16, fontWeight: '700' },
  bottomSpacer: { height: 24 },
});
