import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, ChevronLeft, CreditCard, Phone, History } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { getDriver, getDriverLicenseHistory, updateDriverLicense } from '@/services/api';

interface DriverDetail {
  id: string;
  fullName: string;
  licenseNumber: string;
  phoneNumber: string;
  isActive: boolean;
  createdAt: string;
  licenseExpiryDate: string | null;
}

interface LicenseHistoryEntry {
  id: string;
  driverId: string;
  oldLicenseNumber: string | null;
  newLicenseNumber: string;
  oldExpiryDate: string | null;
  newExpiryDate: string;
  changedBy: string | null;
  changedAt: string;
}

function isLicenseExpired(licenseExpiryDate: string | null): boolean {
  if (!licenseExpiryDate) return false;
  const expiry = new Date(licenseExpiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry < today;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function TripAdminDriverDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [history, setHistory] = useState<LicenseHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const [driverRes, historyRes] = await Promise.all([
        getDriver(id),
        getDriverLicenseHistory(id),
      ]);
      setDriver(driverRes as DriverDetail);
      setHistory(historyRes as LicenseHistoryEntry[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openModal = () => {
    if (!driver) return;
    setLicenseNumber(driver.licenseNumber);
    setExpiryDate(driver.licenseExpiryDate ?? '');
    setSaveError(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!id) return;
    if (!licenseNumber.trim()) {
      setSaveError('License number is required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim())) {
      setSaveError('License expiry date is required (YYYY-MM-DD).');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateDriverLicense(id, {
        license_number: licenseNumber.trim(),
        license_expiry_date: expiryDate.trim(),
      });
      setModalVisible(false);
      await fetchData();
    } catch (err: any) {
      if (err?.error === 'CONFLICT') {
        setSaveError('A driver with this license number already exists.');
      } else {
        setSaveError(err?.message ?? 'Failed to update license.');
      }
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <ChevronLeft size={24} color={theme.colors.primary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Driver Details</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (error || !driver) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centered}>
          <AlertCircle size={48} color={theme.colors.inactive} />
          <Text style={styles.errorText}>Failed to load driver</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const expired = isLicenseExpired(driver.licenseExpiryDate);

  return (
    <View style={styles.root}>
      {header}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.nameRow}>
            <Text style={styles.driverName}>{driver.fullName}</Text>
            <View style={[styles.badge, expired ? styles.badgeExpired : styles.badgeValid]}>
              <Text style={[styles.badgeText, expired ? styles.badgeTextExpired : styles.badgeTextValid]}>
                {expired ? 'License Expired' : 'License Valid'}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <CreditCard size={15} color={theme.colors.grey1} />
            <Text style={styles.detailText}>{driver.licenseNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Phone size={15} color={theme.colors.grey1} />
            <Text style={styles.detailText}>{driver.phoneNumber}</Text>
          </View>

          <View style={styles.expiryRow}>
            <Text style={styles.expiryLabel}>License Expiry Date</Text>
            <Text style={[styles.expiryValue, expired && styles.expiryValueExpired]}>
              {formatDate(driver.licenseExpiryDate)}
            </Text>
          </View>

          {expired && (
            <View style={styles.warningBox}>
              <AlertCircle size={16} color={theme.colors.error} />
              <Text style={styles.warningText}>
                This driver's license has expired. Update their license details before assigning new trips.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.updateButton} onPress={openModal} activeOpacity={0.8}>
            <Text style={styles.updateButtonText}>Update License</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.historySection}>
          <View style={styles.historyHeaderRow}>
            <History size={16} color={theme.colors.grey1} />
            <Text style={styles.historyTitle}>License Update History</Text>
          </View>

          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>No license updates recorded yet.</Text>
          ) : (
            history.map((entry) => (
              <View key={entry.id} style={styles.historyCard}>
                <Text style={styles.historyDate}>{formatDate(entry.changedAt)}</Text>
                <View style={styles.historyLine}>
                  <Text style={styles.historyLabel}>License Number: </Text>
                  <Text style={styles.historyValue}>
                    {entry.oldLicenseNumber ?? '—'} → {entry.newLicenseNumber}
                  </Text>
                </View>
                <View style={styles.historyLine}>
                  <Text style={styles.historyLabel}>Expiry Date: </Text>
                  <Text style={styles.historyValue}>
                    {formatDate(entry.oldExpiryDate)} → {formatDate(entry.newExpiryDate)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update License</Text>

            <Text style={styles.fieldLabel}>LICENSE NUMBER</Text>
            <TextInput
              style={styles.textField}
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="e.g. ABC12345"
              placeholderTextColor={theme.colors.grey1}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>LICENSE EXPIRY DATE</Text>
            <TextInput
              style={styles.textField}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.grey1}
              autoCorrect={false}
            />

            {saveError && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color={theme.colors.error} />
                <Text style={styles.errorBoxText}>{saveError}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, saving && styles.modalSaveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color={theme.colors.white} />
                  : <Text style={styles.modalSaveText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.black,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerSpacer: {
    width: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.grey1,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
  },
  retryButtonText: {
    color: theme.colors.white,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    padding: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  driverName: {
    fontSize: 19,
    fontWeight: '700',
    color: theme.colors.black,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeValid: {
    backgroundColor: '#E3F5E9',
  },
  badgeExpired: {
    backgroundColor: '#FBE4E4',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextValid: {
    color: '#1E8E4E',
  },
  badgeTextExpired: {
    color: theme.colors.error,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.grey1,
  },
  expiryRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.separator,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expiryLabel: {
    fontSize: 13,
    color: theme.colors.grey1,
  },
  expiryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.black,
  },
  expiryValueExpired: {
    color: theme.colors.error,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FBE4E4',
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.error,
  },
  updateButton: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  updateButtonText: {
    color: theme.colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  historySection: {
    marginTop: 24,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
  },
  historyEmpty: {
    fontSize: 13,
    color: theme.colors.grey1,
  },
  historyCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  historyDate: {
    fontSize: 12,
    color: theme.colors.grey1,
    marginBottom: 6,
  },
  historyLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  historyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.black,
  },
  historyValue: {
    fontSize: 13,
    color: theme.colors.grey1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.grey1,
    marginBottom: 6,
  },
  textField: {
    borderWidth: 1,
    borderColor: theme.colors.separator,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.black,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FBE4E4',
  },
  errorBoxText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.error,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  modalCancelText: {
    fontWeight: '600',
    color: theme.colors.black,
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
  },
  modalSaveButtonDisabled: {
    opacity: 0.6,
  },
  modalSaveText: {
    fontWeight: '700',
    color: theme.colors.white,
  },
});
