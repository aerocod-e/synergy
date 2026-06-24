import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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
import { getUsers, createUser, getStates } from '@/services/api';
import type { User, State } from '@/types/index';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';

type CreatableRole = 'state_admin' | 'stakeholder';

function getRoleBadgeColors(role: string): { bg: string; text: string } {
  if (role === 'super_admin') return theme.colors.roleColors.super_admin;
  if (role === 'state_admin') return theme.colors.roleColors.state_admin;
  if (role === 'trip_admin') return theme.colors.roleColors.trip_admin;
  return theme.colors.roleColors.stakeholder;
}

function roleLabel(user: User): string {
  if (user.role === 'super_admin') return 'Super Admin';
  if (user.role === 'state_admin') return user.entityName ? `State Admin — ${user.entityName}` : 'State Admin';
  if (user.role === 'trip_admin') return user.entityName ? `Trip Admin — ${user.entityName}` : 'Trip Admin';
  if (user.role === 'stakeholder') return user.entityName ? `Stakeholder — ${user.entityName}` : 'Stakeholder';
  return user.role;
}

function UserRow({ user, onPress }: { user: User; onPress: () => void }) {
  const badgeColors = getRoleBadgeColors(user.role);
  const displayName = (user.firstName || user.lastName)
    ? `${user.firstName} ${user.lastName}`.trim()
    : null;
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.itemHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          {displayName ? (
            <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          ) : null}
          <Text style={displayName ? styles.emailSecondary : styles.email} numberOfLines={1}>
            {user.email}
          </Text>
        </View>
        <View style={styles.itemRight}>
          <View style={[styles.statusDot, user.isActive ? styles.dotActive : styles.dotInactive]} />
          <Ionicons name="chevron-forward" size={16} color={theme.colors.inactive} style={styles.chevron} />
        </View>
      </View>
      <View style={[styles.roleBadge, { backgroundColor: badgeColors.bg }]}>
        <Text style={[styles.roleBadgeText, { color: badgeColors.text }]}>{roleLabel(user)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const ROLE_OPTIONS: { value: CreatableRole; label: string }[] = [
  { value: 'state_admin', label: 'State Admin' },
  { value: 'stakeholder', label: 'Stakeholder' },
];

export default function UsersScreen() {
  const router = useRouter();
  const PAGE_LIMIT = 20;
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [states, setStates] = useState<State[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<CreatableRole | null>(null);
  const [formEntityId, setFormEntityId] = useState<string | null>(null);
  const [formStakeholderName, setFormStakeholderName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      setPage(1);
      const data = await getUsers({ page: '1', limit: String(PAGE_LIMIT) });
      setUsers(data.users ?? []);
      const pg = data.pagination ?? {};
      setHasMore((pg.page ?? 1) < (pg.totalPages ?? 1));
    } catch {
      setError('Failed to load users');
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await getUsers({ page: String(nextPage), limit: String(PAGE_LIMIT) });
      setUsers((prev) => [...prev, ...(data.users ?? [])]);
      const pg = data.pagination ?? {};
      setHasMore((pg.page ?? nextPage) < (pg.totalPages ?? nextPage));
      setPage(nextPage);
    } catch {
      // silent fail
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchUsers(),
      getStates().then((d) => { if (active) setStates(d.states ?? []); }).catch(() => {}),
    ]).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  }, [fetchUsers]);

  const openModal = () => {
    setFormFirstName('');
    setFormLastName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole(null);
    setFormEntityId(null);
    setFormStakeholderName('');
    setFormError(null);
    setModalVisible(true);
  };

  const handleRoleSelect = (role: CreatableRole) => {
    setFormRole(role);
    setFormEntityId(null);
    setFormStakeholderName('');
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formFirstName.trim()) { setFormError('First name is required.'); return; }
    if (!formLastName.trim())  { setFormError('Last name is required.');  return; }
    if (!formEmail.trim() || !formEmail.includes('@')) { setFormError('A valid email is required.'); return; }
    if (!formPassword || formPassword.length < 6) { setFormError('Password must be at least 6 characters.'); return; }
    if (!formRole) { setFormError('Please select a role.'); return; }
    if (formRole === 'state_admin' && !formEntityId) { setFormError('Please select a state.'); return; }
    if (formRole === 'stakeholder' && !formStakeholderName.trim()) {
      setFormError('Stakeholder / Organization Name is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (formRole === 'stakeholder') {
        await createUser({
          firstName: formFirstName.trim(),
          lastName: formLastName.trim(),
          email: formEmail.trim(),
          password: formPassword,
          role: formRole,
          stakeholderName: formStakeholderName.trim(),
        });
      } else {
        await createUser({
          firstName: formFirstName.trim(),
          lastName: formLastName.trim(),
          email: formEmail.trim(),
          password: formPassword,
          role: formRole,
          entity_type: 'state',
          entity_id: formEntityId,
        });
      }
      setModalVisible(false);
      setRefreshing(true);
      await fetchUsers();
      setRefreshing(false);
    } catch (e: any) {
      setFormError(e?.message ?? 'Failed to create user. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const entityItems: { id: string; label: string }[] =
    formRole === 'state_admin'
      ? states.map((s) => ({ id: s.id, label: s.name }))
      : [];

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => {
          setLoading(true);
          fetchUsers().finally(() => setLoading(false));
        }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TopBar />
      <FlatList
        style={styles.list}
        data={users}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => (
          <UserRow
            user={item}
            onPress={() => router.push(`/(superadmin)/user-detail?id=${item.id}`)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        ListHeaderComponent={
          <Text style={styles.sectionLabel}>All Users ({users.length})</Text>
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
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

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openModal} activeOpacity={0.85}>
        <Ionicons name="person-add-outline" size={22} color={theme.colors.white} />
      </TouchableOpacity>

      {/* Create User Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New User</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* First Name */}
            <Text style={styles.fieldLabel}>First Name</Text>
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="words"
              autoCorrect={false}
              value={formFirstName}
              onChangeText={setFormFirstName}
            />

            {/* Last Name */}
            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Last Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Last name"
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="words"
              autoCorrect={false}
              value={formLastName}
              onChangeText={setFormLastName}
            />

            {/* Email */}
            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="user@example.com"
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={formEmail}
              onChangeText={setFormEmail}
            />

            {/* Password */}
            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Min. 6 characters"
              placeholderTextColor={theme.colors.placeholder}
              secureTextEntry
              value={formPassword}
              onChangeText={setFormPassword}
            />

            {/* Role picker */}
            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Role</Text>
            <View style={styles.roleRow}>
              {ROLE_OPTIONS.map((opt) => {
                const active = formRole === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.roleChip, active && styles.roleChipActive]}
                    onPress={() => handleRoleSelect(opt.value)}
                  >
                    <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Entity picker / Stakeholder name */}
            {formRole !== null && (
              <>
                {formRole === 'stakeholder' ? (
                  <>
                    <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                      Stakeholder / Organization Name
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Lagos Transport Union"
                      placeholderTextColor={theme.colors.placeholder}
                      autoCapitalize="words"
                      autoCorrect={false}
                      value={formStakeholderName}
                      onChangeText={setFormStakeholderName}
                    />
                  </>
                ) : (
                  <>
                    <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>State</Text>
                    {entityItems.length === 0 ? (
                      <Text style={styles.emptyText}>No options available</Text>
                    ) : (
                      <View style={styles.entityList}>
                        {entityItems.map((item) => {
                          const selected = formEntityId === item.id;
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[styles.entityItem, selected && styles.entityItemSelected]}
                              onPress={() => setFormEntityId(item.id)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.entityItemText, selected && styles.entityItemTextSelected]}>
                                {item.label}
                              </Text>
                              {selected && (
                                <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            {/* Error */}
            {formError ? (
              <Text style={styles.formError}>{formError}</Text>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Create User</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  list: { flex: 1 },
  listContent: {},
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
  item: {
    backgroundColor: theme.colors.white,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    ...theme.shadows.card,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chevron: { marginLeft: 2 },
  name: {
    fontWeight: '700',
    fontSize: 14,
    color: theme.colors.black,
    marginBottom: 2,
  },
  email: {
    fontWeight: '700',
    fontSize: 14,
    color: theme.colors.black,
    flex: 1,
    marginRight: 8,
  },
  emailSecondary: {
    fontSize: 12,
    color: theme.colors.grey1,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotActive: { backgroundColor: theme.colors.green },
  dotInactive: { backgroundColor: theme.colors.inactive },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '600' },
  errorText: {
    fontSize: 15,
    color: theme.colors.error,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: theme.colors.white, fontWeight: '600', fontSize: 14 },
  emptyText: { fontSize: 15, color: theme.colors.grey1 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 120,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.strong,
  },

  // Modal
  modalRoot: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.black,
  },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 20, paddingBottom: 48 },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
    marginBottom: 8,
  },
  fieldLabelSpaced: { marginTop: 20 },
  input: {
    backgroundColor: theme.colors.grey4,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.black,
  },

  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.grey4,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  roleChipActive: {
    backgroundColor: theme.colors.blueMuted,
    borderColor: theme.colors.primary,
  },
  roleChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  roleChipTextActive: {
    color: theme.colors.primary,
  },

  entityList: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  entityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  entityItemSelected: {
    backgroundColor: theme.colors.blueMuted,
  },
  entityItemText: {
    fontSize: 14,
    color: theme.colors.grey2,
  },
  entityItemTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },

  formError: {
    fontSize: 13,
    color: theme.colors.error,
    marginTop: 16,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  submitButtonText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.6 },
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
