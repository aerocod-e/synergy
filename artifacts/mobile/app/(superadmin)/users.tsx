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
import { getUsers, createUser, getStates, getStakeholders } from '@/services/api';
import type { User, State, Stakeholder } from '@/types/index';
import { theme } from '@/constants/theme';

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

function UserRow({ user }: { user: User }) {
  const badgeColors = getRoleBadgeColors(user.role);
  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
        <View style={[styles.statusDot, user.isActive ? styles.dotActive : styles.dotInactive]} />
      </View>
      <View style={[styles.roleBadge, { backgroundColor: badgeColors.bg }]}>
        <Text style={[styles.roleBadgeText, { color: badgeColors.text }]}>{roleLabel(user)}</Text>
      </View>
    </View>
  );
}

const ROLE_OPTIONS: { value: CreatableRole; label: string }[] = [
  { value: 'state_admin', label: 'State Admin' },
  { value: 'stakeholder', label: 'Stakeholder' },
];

export default function UsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [states, setStates] = useState<State[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<CreatableRole | null>(null);
  const [formEntityId, setFormEntityId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const data = await getUsers();
      setUsers(data.users ?? []);
    } catch {
      setError('Failed to load users');
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchUsers(),
      getStates().then((d) => { if (active) setStates(d.states ?? []); }).catch(() => {}),
      getStakeholders().then((d) => { if (active) setStakeholders((d.stakeholders ?? []).filter((s: Stakeholder) => s.isActive)); }).catch(() => {}),
    ]).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  }, [fetchUsers]);

  const openModal = () => {
    setFormEmail('');
    setFormPassword('');
    setFormRole(null);
    setFormEntityId(null);
    setFormError(null);
    setModalVisible(true);
  };

  const handleRoleSelect = (role: CreatableRole) => {
    setFormRole(role);
    setFormEntityId(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formEmail.trim() || !formEmail.includes('@')) {
      setFormError('A valid email is required.');
      return;
    }
    if (!formPassword || formPassword.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (!formRole) {
      setFormError('Please select a role.');
      return;
    }
    if (!formEntityId) {
      setFormError(`Please select a ${formRole === 'state_admin' ? 'state' : 'stakeholder'}.`);
      return;
    }

    setSubmitting(true);
    try {
      await createUser({
        email: formEmail.trim(),
        password: formPassword,
        role: formRole,
        entity_type: formRole === 'state_admin' ? 'state' : 'stakeholder',
        entity_id: formEntityId,
      });
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
      : formRole === 'stakeholder'
      ? stakeholders.map((s) => ({ id: s.id, label: s.name }))
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
      <FlatList
        style={styles.list}
        data={users}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => <UserRow user={item} />}
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
        ListFooterComponent={() => <View style={{ height: theme.PILL_NAV_BOTTOM_PADDING }} />}
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
            {/* Email */}
            <Text style={styles.fieldLabel}>Email</Text>
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

            {/* Entity picker */}
            {formRole !== null && (
              <>
                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                  {formRole === 'state_admin' ? 'State' : 'Stakeholder'}
                </Text>
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
  email: {
    fontWeight: '700',
    fontSize: 14,
    color: theme.colors.black,
    flex: 1,
    marginRight: 8,
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
});
