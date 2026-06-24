import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { listDrivers, createDriver, updateDriver } from '@/services/api';
import { useLogout } from '@/hooks/useLogout';

interface DriverItem {
  id: string;
  fullName: string;
  licenseNumber: string;
  phoneNumber: string;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  tripCount: number;
}

export default function TripAdminDrivers() {
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const [fullName, setFullName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const PAGE_LIMIT = 20;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [editingDriver, setEditingDriver] = useState<DriverItem | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const navigation = useNavigation();
  const { handleLogout } = useLogout();

  const openModal = useCallback(() => {
    setFullName('');
    setLicenseNumber('');
    setPhoneNumber('');
    setRegisterError(null);
    setModalVisible(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') {
        navigation.setOptions({
          headerRight: () => (
            <View style={styles.headerRight}>
              <TouchableOpacity
                onPress={openModal}
                style={styles.headerBtn}
                accessibilityLabel="Register driver"
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
    }, [navigation, openModal, handleLogout])
  );

  const fetchDrivers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setPage(1);
    try {
      const data = await listDrivers({ page: '1', limit: String(PAGE_LIMIT) });
      setDrivers((data as any).drivers as DriverItem[]);
      const pg = (data as any).pagination ?? {};
      setHasMore((pg.page ?? 1) < (pg.totalPages ?? 1));
      setFetchError(null);
    } catch {
      setFetchError("Couldn't load your drivers");
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
      const data = await listDrivers({ page: String(nextPage), limit: String(PAGE_LIMIT) });
      setDrivers((prev) => [...prev, ...((data as any).drivers as DriverItem[])]);
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
      fetchDrivers();
    }, [fetchDrivers])
  );

  const handleRegister = async () => {
    if (!fullName.trim()) {
      setRegisterError('Full name is required.');
      return;
    }
    if (!licenseNumber.trim()) {
      setRegisterError('License number is required.');
      return;
    }
    if (!phoneNumber.trim()) {
      setRegisterError('Phone number is required.');
      return;
    }
    setRegisterError(null);
    setRegistering(true);
    try {
      await createDriver({
        full_name: fullName.trim(),
        license_number: licenseNumber.trim(),
        phone_number: phoneNumber.trim(),
      });
      setModalVisible(false);
      fetchDrivers();
    } catch (err: any) {
      if (err?.error === 'CONFLICT') {
        setRegisterError('A driver with this license number already exists.');
      } else {
        setRegisterError(err?.message ?? 'Failed to register driver.');
      }
    } finally {
      setRegistering(false);
    }
  };

  const openEditModal = useCallback((driver: DriverItem) => {
    setEditingDriver(driver);
    setEditFullName(driver.fullName);
    setEditPhoneNumber(driver.phoneNumber);
    setEditError(null);
  }, []);

  const handleEditSubmit = async () => {
    if (!editingDriver) return;
    const trimmedName  = editFullName.trim();
    const trimmedPhone = editPhoneNumber.trim();
    if (!trimmedName && !trimmedPhone) {
      setEditError('Enter a new name or phone number.');
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const body: { full_name?: string; phone_number?: string } = {};
      if (trimmedName  !== editingDriver.fullName)   body.full_name    = trimmedName;
      if (trimmedPhone !== editingDriver.phoneNumber) body.phone_number = trimmedPhone;
      if (Object.keys(body).length === 0) { setEditingDriver(null); return; }
      await updateDriver(editingDriver.id, body);
      setEditingDriver(null);
      fetchDrivers(true);
    } catch (err: any) {
      setEditError(err?.message ?? 'Failed to update driver.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const renderDriver = ({ item }: { item: DriverItem }) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <Text style={styles.driverName}>{item.fullName}</Text>
        <View style={styles.detailRow}>
          <Ionicons name="card-outline" size={13} color={theme.colors.grey1} />
          <Text style={styles.detailText}>{item.licenseNumber}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="call-outline" size={13} color={theme.colors.grey1} />
          <Text style={styles.detailText}>{item.phoneNumber}</Text>
        </View>
        <Text style={styles.tripCount}>
          {item.tripCount} {item.tripCount === 1 ? 'trip' : 'trips'}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => openEditModal(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Edit driver"
      >
        <Ionicons name="create-outline" size={22} color={theme.colors.primary} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (fetchError && drivers.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.inactive} />
        <Text style={styles.fetchErrorTitle}>{fetchError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => fetchDrivers()}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={drivers}
        keyExtractor={(d) => d.id}
        renderItem={renderDriver}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDrivers(true)}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="person-outline" size={48} color={theme.colors.inactive} />
            <Text style={styles.emptyTitle}>No drivers yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to register your first driver</Text>
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
          onPress={openModal}
          activeOpacity={0.85}
          accessibilityLabel="Register driver"
        >
          <Ionicons name="add" size={28} color={theme.colors.white} />
        </TouchableOpacity>
      )}

      {Platform.OS === 'web' && (
        <TouchableOpacity
          style={styles.webAddBtn}
          onPress={openModal}
          activeOpacity={0.85}
          accessibilityLabel="Register new driver"
        >
          <Ionicons name="add-circle-outline" size={20} color={theme.colors.white} />
          <Text style={styles.webAddBtnText}>Register New Driver</Text>
        </TouchableOpacity>
      )}

      {/* ── Edit driver modal ───────────────────────────────────────────── */}
      <Modal
        visible={editingDriver !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingDriver(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Driver</Text>
            <TouchableOpacity
              onPress={() => setEditingDriver(null)}
              accessibilityLabel="Close modal"
            >
              <Ionicons name="close" size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>LICENSE NUMBER</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{editingDriver?.licenseNumber}</Text>
            </View>
            <Text style={styles.readOnlyNote}>License number cannot be changed</Text>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>FULL NAME</Text>
            <TextInput
              style={styles.textField}
              value={editFullName}
              onChangeText={setEditFullName}
              placeholder="e.g. John Doe"
              placeholderTextColor={theme.colors.grey1}
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>PHONE NUMBER</Text>
            <TextInput
              style={styles.textField}
              value={editPhoneNumber}
              onChangeText={setEditPhoneNumber}
              placeholder="e.g. 08012345678"
              placeholderTextColor={theme.colors.grey1}
              keyboardType="phone-pad"
              autoCorrect={false}
            />

            {editError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
                <Text style={styles.errorText}>{editError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, editSubmitting && styles.submitButtonDisabled]}
              onPress={handleEditSubmit}
              activeOpacity={0.85}
              disabled={editSubmitting}
            >
              {editSubmitting ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Register driver modal ────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Register Driver</Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              accessibilityLabel="Close modal"
            >
              <Ionicons name="close" size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>FULL NAME</Text>
            <TextInput
              style={styles.textField}
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. John Doe"
              placeholderTextColor={theme.colors.grey1}
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>LICENSE NUMBER</Text>
            <TextInput
              style={styles.textField}
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="e.g. ABC123456"
              placeholderTextColor={theme.colors.grey1}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>PHONE NUMBER</Text>
            <TextInput
              style={styles.textField}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="e.g. 08012345678"
              placeholderTextColor={theme.colors.grey1}
              keyboardType="phone-pad"
              autoCorrect={false}
            />

            {registerError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
                <Text style={styles.errorText}>{registerError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, registering && styles.submitButtonDisabled]}
              onPress={handleRegister}
              activeOpacity={0.85}
              disabled={registering}
            >
              {registering ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Register Driver</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    gap: 12,
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...theme.shadows.card,
  },
  cardLeft: {
    flex: 1,
    gap: 5,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailText: {
    fontSize: 13,
    color: theme.colors.grey1,
    fontWeight: '500',
  },
  tripCount: {
    fontSize: 13,
    color: theme.colors.grey1,
    fontWeight: '500',
    marginTop: 2,
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
  webAddBtn: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    ...theme.shadows.strong,
  },
  webAddBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.white,
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
  },
  fieldLabel: {
    ...theme.typography.sectionLabel,
    marginBottom: 6,
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
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
  readOnlyField: {
    backgroundColor: theme.colors.grey3,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    justifyContent: 'center',
  },
  readOnlyText: {
    fontSize: 15,
    color: theme.colors.grey2,
    fontWeight: '600',
  },
  readOnlyNote: {
    fontSize: 12,
    color: theme.colors.grey1,
    marginTop: 4,
    marginBottom: 4,
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
