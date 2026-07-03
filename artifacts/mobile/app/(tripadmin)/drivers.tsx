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
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { AlertCircle, BarChart2, CloudOff, CreditCard, LogOut, Pencil, Phone, Plus, PlusCircle, Trash2, User, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import ScreenTransition from '@/components/ScreenTransition';
import SlideUpList from '@/components/SlideUpList';
import { listDrivers, createDriver, updateDriver, deleteDriver as deleteDriverApi } from '@/services/api';
import { useLogout } from '@/hooks/useLogout';
import { confirmAction } from '@/utils/confirmAction';

interface DriverItem {
  id: string;
  fullName: string;
  licenseNumber: string;
  phoneNumber: string;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  tripCount: number;
  licenseExpiryDate: string | null;
}

function isLicenseExpired(licenseExpiryDate: string | null): boolean {
  if (!licenseExpiryDate) return false;
  const expiry = new Date(licenseExpiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry < today;
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
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('');

  const PAGE_LIMIT = 20;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [editingDriver, setEditingDriver] = useState<DriverItem | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});

  const navigation = useNavigation();
  const router     = useRouter();
  const { handleLogout } = useLogout();

  const [auditModalVisible,  setAuditModalVisible]  = useState(false);
  const [auditMode,          setAuditMode]          = useState<'choice' | 'select'>('choice');
  const [auditDriverSearch,  setAuditDriverSearch]  = useState('');

  const openAuditPicker = useCallback(() => {
    setAuditMode('choice');
    setAuditDriverSearch('');
    setAuditModalVisible(true);
  }, []);

  const goAuditAll = () => {
    setAuditModalVisible(false);
    router.push('/(tripadmin)/audit-report?entityType=driver');
  };

  const goAuditDriver = (d: DriverItem) => {
    setAuditModalVisible(false);
    router.push(`/(tripadmin)/audit-report?entityType=driver&driverId=${d.id}&driverName=${encodeURIComponent(d.fullName)}`);
  };

  const openModal = useCallback(() => {
    setFullName('');
    setLicenseNumber('');
    setPhoneNumber('');
    setLicenseExpiryDate('');
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
                onPress={openAuditPicker}
                style={styles.headerBtn}
                accessibilityLabel="Driver audit report"
              >
                <BarChart2 size={24} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openModal}
                style={styles.headerBtn}
                accessibilityLabel="Register driver"
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
    }, [navigation, openModal, openAuditPicker, handleLogout])
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiryDate.trim())) {
      setRegisterError('License expiry date is required (YYYY-MM-DD).');
      return;
    }
    setRegisterError(null);
    setRegistering(true);
    try {
      await createDriver({
        full_name: fullName.trim(),
        license_number: licenseNumber.trim(),
        phone_number: phoneNumber.trim(),
        license_expiry_date: licenseExpiryDate.trim(),
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

  const handleDeleteDriver = useCallback((item: DriverItem) => {
    confirmAction({
      title: `Remove ${item.fullName}?`,
      message: 'This cannot be undone. Drivers with active trips cannot be removed.',
      confirmText: 'Remove',
      destructive: true,
      onConfirm: async () => {
        setDeleting((prev) => ({ ...prev, [item.id]: true }));
        setDeleteError((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        try {
          await deleteDriverApi(item.id);
          setDrivers((prev) => prev.filter((d) => d.id !== item.id));
        } catch (err: any) {
          setDeleteError((prev) => ({
            ...prev,
            [item.id]: err?.message ?? 'Failed to remove driver.',
          }));
        } finally {
          setDeleting((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        }
      },
    });
  }, []);

  const renderDriver = ({ item }: { item: DriverItem }) => {
    const expired = isLicenseExpired(item.licenseExpiryDate);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(tripadmin)/driver-detail?id=${item.id}`)}
        activeOpacity={0.85}
      >
        <View style={styles.cardMain}>
          <View style={styles.cardLeft}>
            <View style={styles.nameRow}>
              <Text style={styles.driverName}>{item.fullName}</Text>
              {item.licenseExpiryDate && (
                <View style={[styles.licenseBadge, expired ? styles.licenseBadgeExpired : styles.licenseBadgeValid]}>
                  <Text style={[styles.licenseBadgeText, expired ? styles.licenseBadgeTextExpired : styles.licenseBadgeTextValid]}>
                    {expired ? 'Expired' : 'Valid'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.detailRow}>
              <CreditCard size={13} color={theme.colors.grey1} />
              <Text style={styles.detailText}>{item.licenseNumber}</Text>
            </View>
            <View style={styles.detailRow}>
              <Phone size={13} color={theme.colors.grey1} />
              <Text style={styles.detailText}>{item.phoneNumber}</Text>
            </View>
            <Text style={styles.tripCount}>
              {item.tripCount} {item.tripCount === 1 ? 'trip' : 'trips'}
            </Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity
              onPress={() => openEditModal(item)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Edit driver"
            >
              <Pencil size={22} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDeleteDriver(item)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              disabled={!!deleting[item.id]}
              accessibilityLabel="Remove driver"
            >
              {deleting[item.id]
                ? <ActivityIndicator size="small" color={theme.colors.error} />
                : <Trash2 size={22} color={theme.colors.error} />
              }
            </TouchableOpacity>
          </View>
        </View>
        {deleteError[item.id] ? (
          <View style={styles.cardError}>
            <AlertCircle size={13} color={theme.colors.error} />
            <Text style={styles.cardErrorText}>{deleteError[item.id]}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

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
        <CloudOff size={48} color={theme.colors.inactive} />
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
      <TopBar />
      <ScreenTransition style={{ flex: 1 }}>
      <SlideUpList style={{ flex: 1 }}>
      <FlatList
        data={drivers}
        keyExtractor={(d) => d.id}
        renderItem={renderDriver}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeaderRow}>
            <Text style={styles.listHeaderTitle}>Drivers</Text>
            <TouchableOpacity
              style={styles.auditBannerBtn}
              onPress={openAuditPicker}
              activeOpacity={0.85}
            >
              <BarChart2 size={16} color={theme.colors.primary} />
              <Text style={styles.auditBannerText}>Audit Report</Text>
            </TouchableOpacity>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDrivers(true)}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <User size={48} color={theme.colors.inactive} />
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
      </SlideUpList>

      {Platform.OS !== 'web' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openModal}
          activeOpacity={0.85}
          accessibilityLabel="Register driver"
        >
          <Plus size={28} color={theme.colors.white} />
        </TouchableOpacity>
      )}

      {Platform.OS === 'web' && (
        <TouchableOpacity
          style={styles.webAddBtn}
          onPress={openModal}
          activeOpacity={0.85}
          accessibilityLabel="Register new driver"
        >
          <PlusCircle size={20} color={theme.colors.white} />
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
              <X size={24} color={theme.colors.grey2} />
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
                <AlertCircle size={16} color={theme.colors.error} />
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
              <X size={24} color={theme.colors.grey2} />
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

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>LICENSE EXPIRY DATE</Text>
            <TextInput
              style={styles.textField}
              value={licenseExpiryDate}
              onChangeText={setLicenseExpiryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.grey1}
              autoCorrect={false}
            />

            {registerError && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color={theme.colors.error} />
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

      {/* ── Audit picker modal ──────────────────────────────────────────── */}
      <Modal
        visible={auditModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAuditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {auditMode === 'choice' ? 'Driver Audit Report' : 'Select a Driver'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (auditMode === 'select') { setAuditMode('choice'); }
                else { setAuditModalVisible(false); }
              }}
              accessibilityLabel="Close"
            >
              <X size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          {auditMode === 'choice' ? (
            <View style={styles.auditChoiceBody}>
              <TouchableOpacity style={styles.auditChoiceBtn} onPress={goAuditAll} activeOpacity={0.85}>
                <BarChart2 size={22} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditChoiceTitle}>All Drivers</Text>
                  <Text style={styles.auditChoiceSub}>Aggregate report across every driver</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.auditChoiceBtn}
                onPress={() => setAuditMode('select')}
                activeOpacity={0.85}
              >
                <User size={22} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditChoiceTitle}>Select a Driver</Text>
                  <Text style={styles.auditChoiceSub}>Report for one specific driver</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.modalBody}>
              <TextInput
                style={[styles.textField, { marginBottom: 12 }]}
                placeholder="Search by name or license…"
                placeholderTextColor={theme.colors.grey1}
                value={auditDriverSearch}
                onChangeText={setAuditDriverSearch}
                autoCorrect={false}
              />
              <FlatList
                data={drivers.filter((d) => {
                  const q = auditDriverSearch.toLowerCase();
                  return !q || d.fullName.toLowerCase().includes(q) || d.licenseNumber.toLowerCase().includes(q);
                })}
                keyExtractor={(d) => d.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.auditDriverRow}
                    onPress={() => goAuditDriver(item)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.auditDriverName}>{item.fullName}</Text>
                      <Text style={styles.auditDriverSub}>{item.licenseNumber}</Text>
                    </View>
                    <BarChart2 size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{ color: theme.colors.grey1, textAlign: 'center', marginTop: 32 }}>
                    No drivers found
                  </Text>
                }
              />
            </View>
          )}
        </View>
      </Modal>
      </ScreenTransition>
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
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 10,
    ...theme.shadows.card,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
    gap: 5,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginLeft: 12,
  },
  cardError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardErrorText: {
    fontSize: 12,
    color: theme.colors.error,
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.black,
  },
  licenseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  licenseBadgeValid: {
    backgroundColor: '#E3F5E9',
  },
  licenseBadgeExpired: {
    backgroundColor: '#FBE4E4',
  },
  licenseBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  licenseBadgeTextValid: {
    color: '#1E8E4E',
  },
  licenseBadgeTextExpired: {
    color: theme.colors.error,
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
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  listHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.black,
  },
  auditBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: theme.colors.blueMuted,
  },
  auditBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  auditChoiceBody: {
    padding: 20,
    gap: 12,
  },
  auditChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    ...theme.shadows.card,
  },
  auditChoiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 2,
  },
  auditChoiceSub: {
    fontSize: 13,
    color: theme.colors.grey1,
  },
  auditDriverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  auditDriverName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.black,
  },
  auditDriverSub: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginTop: 2,
  },
  modalBody: {
    padding: 20,
    flex: 1,
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
