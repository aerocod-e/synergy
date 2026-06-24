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
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { listTripAdmins, createUser, updateCancellationRights, toggleUserActive, getTripAdminActiveTripsCount } from '@/services/api';
import { useAuthContext } from '@/app/_layout';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TripAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  canCancelWithoutApproval: boolean;
  createdAt: string;
  tripCount: number;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function StateAdminTripAdmins() {
  const { user } = useAuthContext();
  const navigation = useNavigation();

  const PAGE_LIMIT = 20;
  const [admins, setAdmins] = useState<TripAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // toggle error per-card (cancellation rights)
  const [toggleError, setToggleError] = useState<string | null>(null);
  // BUG-09: track in-flight cancellation-rights requests per card to prevent race conditions
  const [cancellationToggling, setCancellationToggling] = useState<Record<string, boolean>>({});

  // per-card active toggle state
  const [activeToggling, setActiveToggling] = useState<Record<string, boolean>>({});
  const [activeToggleError, setActiveToggleError] = useState<Record<string, string>>({});

  // deactivation confirmation modal
  const [confirmDeactivate, setConfirmDeactivate] = useState<{
    admin: TripAdmin;
    activeTripsCount: number;
  } | null>(null);
  const [confirmDeactivating, setConfirmDeactivating] = useState(false);

  // create modal
  const [modalVisible, setModalVisible] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── fetch ─────────────────────────────────────────────────────────────────

  const fetchAdmins = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setPage(1);
    try {
      const data = await listTripAdmins({ page: '1', limit: String(PAGE_LIMIT) });
      setAdmins((data as any).tripAdmins as TripAdmin[]);
      const pg = (data as any).pagination ?? {};
      setHasMore((pg.page ?? 1) < (pg.totalPages ?? 1));
      setFetchError(null);
    } catch {
      setFetchError("Couldn't load trip admins");
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
      const data = await listTripAdmins({ page: String(nextPage), limit: String(PAGE_LIMIT) });
      setAdmins((prev) => [...prev, ...((data as any).tripAdmins as TripAdmin[])]);
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
      fetchAdmins();
    }, [fetchAdmins])
  );

  // ── header button (web) ─────────────────────────────────────────────────────

  const openModal = useCallback(() => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setSubmitError(null);
    setModalVisible(true);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={openModal}
            style={styles.headerBtn}
            accessibilityLabel="Add Trip Admin"
          >
            <Ionicons name="add-circle-outline" size={26} color={theme.colors.primary} />
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, openModal]);

  // ── toggle active status ──────────────────────────────────────────────────────

  const executeToggleActive = useCallback(async (admin: TripAdmin, isActive: boolean) => {
    setActiveToggling((prev) => ({ ...prev, [admin.id]: true }));
    setActiveToggleError((prev) => { const n = { ...prev }; delete n[admin.id]; return n; });
    setAdmins((prev) =>
      prev.map((a) => (a.id === admin.id ? { ...a, isActive } : a))
    );
    try {
      await toggleUserActive(admin.id, isActive);
    } catch (err: any) {
      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, isActive: admin.isActive } : a))
      );
      setActiveToggleError((prev) => ({
        ...prev,
        [admin.id]: err?.message ?? (isActive ? 'Failed to reactivate' : 'Failed to deactivate'),
      }));
    } finally {
      setActiveToggling((prev) => { const n = { ...prev }; delete n[admin.id]; return n; });
    }
  }, []);

  const handleToggleActive = useCallback(async (admin: TripAdmin, isActive: boolean) => {
    // Reactivation never needs a warning
    if (isActive) {
      executeToggleActive(admin, isActive);
      return;
    }
    // Deactivation: check for in-progress trips first
    setActiveToggling((prev) => ({ ...prev, [admin.id]: true }));
    setActiveToggleError((prev) => { const n = { ...prev }; delete n[admin.id]; return n; });
    try {
      const res = await getTripAdminActiveTripsCount(admin.id);
      const activeTripsCount: number = (res as any)?.activeTripsCount ?? 0;
      if (activeTripsCount > 0) {
        setConfirmDeactivate({ admin, activeTripsCount });
      } else {
        executeToggleActive(admin, false);
      }
    } catch {
      // Fail safe: if we can't verify active trips, do not deactivate
      setActiveToggleError((prev) => ({
        ...prev,
        [admin.id]: "Couldn't verify active trips. Try again.",
      }));
    } finally {
      setActiveToggling((prev) => { const n = { ...prev }; delete n[admin.id]; return n; });
    }
  }, [executeToggleActive]);

  // ── toggle pre-approval ──────────────────────────────────────────────────────

  const handleToggle = useCallback(async (admin: TripAdmin, value: boolean) => {
    // BUG-09: disable the switch while a request is in-flight so rapid taps
    // cannot fire multiple concurrent PATCH requests whose out-of-order responses
    // may leave the DB state out of sync with the UI.
    setCancellationToggling((prev) => ({ ...prev, [admin.id]: true }));
    setToggleError(null);
    setAdmins((prev) =>
      prev.map((a) => (a.id === admin.id ? { ...a, canCancelWithoutApproval: value } : a))
    );
    try {
      await updateCancellationRights(admin.id, value);
    } catch (err: any) {
      setAdmins((prev) =>
        prev.map((a) =>
          a.id === admin.id ? { ...a, canCancelWithoutApproval: admin.canCancelWithoutApproval } : a
        )
      );
      setToggleError(err?.message ?? 'Failed to update cancellation rights');
    } finally {
      setCancellationToggling((prev) => { const n = { ...prev }; delete n[admin.id]; return n; });
    }
  }, []);

  // ── create Trip Admin ────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!firstName.trim()) {
      setSubmitError('First name is required.');
      return;
    }
    if (!lastName.trim()) {
      setSubmitError('Last name is required.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setSubmitError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: 'trip_admin',
        entity_type: 'state',
        entity_id: user?.entityId,
      });
      setModalVisible(false);
      fetchAdmins(true);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to create trip admin.');
    } finally {
      setSubmitting(false);
    }
  }, [firstName, lastName, email, password, user?.entityId, fetchAdmins]);

  // ── render item ───────────────────────────────────────────────────────────

  const renderAdmin = ({ item }: { item: TripAdmin }) => {
    const displayName = (item.firstName || item.lastName)
      ? `${item.firstName} ${item.lastName}`.trim()
      : null;
    return (
    <View style={[styles.card, !item.isActive && styles.cardInactive]}>
      <View style={styles.cardTop}>
        <View style={styles.emailRow}>
          <Ionicons name="person-circle-outline" size={20} color={theme.colors.grey1} />
          <View style={{ flex: 1 }}>
            {displayName ? (
              <Text style={styles.nameText} numberOfLines={1}>{displayName}</Text>
            ) : null}
            <Text style={displayName ? styles.emailTextSecondary : styles.emailText} numberOfLines={1}>{item.email}</Text>
            <Text style={styles.tripCountText}>{item.tripCount} {item.tripCount === 1 ? 'trip' : 'trips'}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, item.isActive ? styles.statusActive : styles.statusInactive]}>
          <Text style={[styles.statusText, item.isActive ? styles.statusTextActive : styles.statusTextInactive]}>
            {item.isActive ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>

      <View style={[styles.toggleRow, cancellationToggling[item.id] && styles.toggleRowDisabled]}>
        <View style={styles.toggleLabelCol}>
          <Text style={styles.toggleLabel}>Pre-approved cancellations</Text>
          <Text style={styles.toggleSub}>Can cancel trips without State Admin approval</Text>
        </View>
        <Switch
          value={item.canCancelWithoutApproval}
          onValueChange={(val) => {
            if (cancellationToggling[item.id]) return;
            handleToggle(item, val);
          }}
          disabled={!!cancellationToggling[item.id]}
          trackColor={{ false: theme.colors.inactive, true: theme.colors.primary }}
          thumbColor={theme.colors.white}
        />
      </View>

      <View style={styles.activeToggleRow}>
        <TouchableOpacity
          style={[
            styles.activeToggleBtn,
            item.isActive ? styles.deactivateBtn : styles.reactivateBtn,
            activeToggling[item.id] && styles.activeToggleBtnDisabled,
          ]}
          onPress={() => handleToggleActive(item, !item.isActive)}
          disabled={!!activeToggling[item.id]}
          activeOpacity={0.8}
        >
          {activeToggling[item.id] ? (
            <ActivityIndicator size="small" color={theme.colors.white} />
          ) : (
            <>
              <Ionicons
                name={item.isActive ? 'ban-outline' : 'checkmark-circle-outline'}
                size={15}
                color={theme.colors.white}
              />
              <Text style={styles.activeToggleBtnText}>
                {item.isActive ? 'Deactivate' : 'Reactivate'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {activeToggleError[item.id] && (
        <View style={styles.cardError}>
          <Ionicons name="alert-circle-outline" size={13} color={theme.colors.error} />
          <Text style={styles.cardErrorText}>{activeToggleError[item.id]}</Text>
        </View>
      )}
    </View>
  );
  };

  // ── loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (fetchError && admins.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.inactive} />
        <Text style={styles.fetchErrorTitle}>{fetchError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => fetchAdmins()}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── main ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <FlatList
        data={admins}
        keyExtractor={(a) => a.id}
        renderItem={renderAdmin}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchAdmins(true)}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <Text style={styles.listHeaderTitle}>Trip Admins</Text>
            {toggleError && (
              <View style={styles.inlineError}>
                <Ionicons name="alert-circle-outline" size={15} color={theme.colors.error} />
                <Text style={styles.inlineErrorText}>{toggleError}</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={theme.colors.inactive} />
            <Text style={styles.emptyTitle}>No Trip Admins yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to add the first Trip Admin</Text>
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
          accessibilityLabel="Add Trip Admin"
        >
          <Ionicons name="add" size={28} color={theme.colors.white} />
        </TouchableOpacity>
      )}

      {/* ── Deactivation warning modal ── */}
      <Modal
        visible={!!confirmDeactivate}
        animationType="fade"
        transparent
        onRequestClose={() => !confirmDeactivating && setConfirmDeactivate(null)}
      >
        <View style={styles.overlayBackdrop}>
          <View style={styles.warningCard}>
            <View style={styles.warningIconRow}>
              <Ionicons name="warning-outline" size={28} color="#F59E0B" />
            </View>
            <Text style={styles.warningTitle}>Active Trips Warning</Text>
            <Text style={styles.warningBody}>
              {confirmDeactivate
                ? `This Trip Admin has ${confirmDeactivate.activeTripsCount} active trip${confirmDeactivate.activeTripsCount === 1 ? '' : 's'}. Deactivating them will not cancel those trips. Continue?`
                : ''}
            </Text>
            <View style={styles.warningActions}>
              <TouchableOpacity
                style={[styles.warningBtn, styles.warningBtnCancel]}
                onPress={() => setConfirmDeactivate(null)}
                disabled={confirmDeactivating}
                activeOpacity={0.8}
              >
                <Text style={styles.warningBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.warningBtn, styles.warningBtnConfirm, confirmDeactivating && styles.activeToggleBtnDisabled]}
                disabled={confirmDeactivating}
                activeOpacity={0.8}
                onPress={async () => {
                  if (!confirmDeactivate) return;
                  setConfirmDeactivating(true);
                  const { admin } = confirmDeactivate;
                  setConfirmDeactivate(null);
                  await executeToggleActive(admin, false);
                  setConfirmDeactivating(false);
                }}
              >
                {confirmDeactivating ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.warningBtnConfirmText}>Deactivate</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Create Trip Admin modal ── */}
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
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Trip Admin</Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>FIRST NAME</Text>
            <TextInput
              style={styles.textField}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor={theme.colors.grey1}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>LAST NAME</Text>
            <TextInput
              style={styles.textField}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor={theme.colors.grey1}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>EMAIL</Text>
            <TextInput
              style={styles.textField}
              value={email}
              onChangeText={setEmail}
              placeholder="tripadmin@example.com"
              placeholderTextColor={theme.colors.grey1}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.textField, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 characters"
                placeholderTextColor={theme.colors.grey1}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.grey1}
                />
              </TouchableOpacity>
            </View>

            {submitError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
                <Text style={styles.errorText}>{submitError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleCreate}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Create Trip Admin</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────

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
  listHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 12,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  inlineErrorText: {
    fontSize: 13,
    color: theme.colors.error,
    flex: 1,
  },

  // card
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    ...theme.shadows.card,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  nameText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 2,
  },
  emailText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
  },
  emailTextSecondary: {
    fontSize: 12,
    color: theme.colors.grey1,
  },
  tripCountText: {
    fontSize: 12,
    color: theme.colors.grey1,
    marginTop: 1,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusActive: {
    backgroundColor: theme.colors.greenMuted,
  },
  statusInactive: {
    backgroundColor: theme.colors.grey3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextActive: {
    color: theme.colors.greenText,
  },
  statusTextInactive: {
    color: theme.colors.grey1,
  },
  cardInactive: {
    opacity: 0.6,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleRowDisabled: {
    opacity: 0.45,
  },
  toggleLabelCol: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
  },
  toggleSub: {
    fontSize: 12,
    color: theme.colors.grey1,
    lineHeight: 16,
  },

  // active toggle button
  activeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
  },
  activeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  activeToggleBtnDisabled: {
    opacity: 0.5,
  },
  deactivateBtn: {
    backgroundColor: theme.colors.error,
  },
  reactivateBtn: {
    backgroundColor: theme.colors.greenText,
  },
  activeToggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.white,
  },
  cardError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 2,
  },
  cardErrorText: {
    fontSize: 12,
    color: theme.colors.error,
    flex: 1,
  },

  // empty / error
  empty: {
    alignItems: 'center',
    paddingTop: 60,
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
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  headerBtn: {
    padding: 6,
    marginRight: 8,
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
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.grey1,
    letterSpacing: 0.6,
    marginBottom: 8,
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyeBtn: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    borderRadius: 12,
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
    height: 52,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.white,
  },

  // warning modal
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  warningCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    gap: 12,
  },
  warningIconRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  warningTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.black,
    textAlign: 'center',
  },
  warningBody: {
    fontSize: 14,
    color: theme.colors.grey2,
    textAlign: 'center',
    lineHeight: 20,
  },
  warningActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  warningBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningBtnCancel: {
    backgroundColor: theme.colors.grey3,
  },
  warningBtnConfirm: {
    backgroundColor: theme.colors.error,
  },
  warningBtnCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.grey1,
  },
  warningBtnConfirmText: {
    fontSize: 14,
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
