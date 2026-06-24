import {
  ActivityIndicator,
  Alert,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthContext } from '@/app/_layout';
import { getUser, updateUser, resetUserPassword, toggleUserActive, deleteUser } from '@/services/api';
import type { User } from '@/types/index';
import { theme } from '@/constants/theme';

function getRoleBadgeColors(role: string): { bg: string; text: string } {
  if (role === 'super_admin') return theme.colors.roleColors.super_admin;
  if (role === 'state_admin') return theme.colors.roleColors.state_admin;
  if (role === 'trip_admin')  return theme.colors.roleColors.trip_admin;
  return theme.colors.roleColors.stakeholder;
}

function roleLabel(role: string): string {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'state_admin') return 'State Admin';
  if (role === 'trip_admin')  return 'Trip Admin';
  if (role === 'stakeholder') return 'Stakeholder';
  return role;
}

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user: currentUser } = useAuthContext();

  const [user, setUser]           = useState<User | null>(null);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError,   setActionError]   = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setFetchError(false);
    try {
      const data = await getUser(id);
      const u = data.user as User;
      setUser(u);
      setFirstName(u.firstName);
      setLastName(u.lastName);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const nameChanged =
    user !== null &&
    (firstName.trim() !== user.firstName || lastName.trim() !== user.lastName);

  const isOwnAccount  = currentUser?.id === id;
  const isTargetSuper = user?.role === 'super_admin';

  const handleSave = async () => {
    if (!nameChanged || !id) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const data = await updateUser(id, { firstName: firstName.trim(), lastName: lastName.trim() });
      const updated = data.user as User;
      setUser((prev) => prev ? { ...prev, firstName: updated.firstName, lastName: updated.lastName } : prev);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Failed to save name.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!id) return;
    setActionLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const data = await resetUserPassword(id);
      setActionMessage(data.message ?? 'Password reset to Temp@1234.');
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to reset password.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (activate: boolean) => {
    if (!id) return;
    setActionLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      await toggleUserActive(id, activate);
      setUser((prev) => prev ? { ...prev, isActive: activate } : prev);
      setActionMessage(activate ? 'Account reactivated.' : 'Account deactivated.');
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to update account status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently deactivate this account? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setActionLoading(true);
            setActionMessage(null);
            setActionError(null);
            try {
              await deleteUser(id);
              router.back();
            } catch (e: any) {
              setActionError(e?.message ?? 'Failed to delete account.');
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (fetchError || !user) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.inactive} />
        <Text style={styles.errorText}>Failed to load user</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchUser}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const badgeColors = getRoleBadgeColors(user.role);

  const showResetPassword = !isOwnAccount && !isTargetSuper;
  const showDeactivate    = user.isActive && !isOwnAccount;
  const showReactivate    = !user.isActive;
  const showDelete        = !isOwnAccount && !isTargetSuper;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>User Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Status + role badges */}
        <View style={styles.badgeRow}>
          <View style={[styles.roleBadge, { backgroundColor: badgeColors.bg }]}>
            <Text style={[styles.roleBadgeText, { color: badgeColors.text }]}>
              {roleLabel(user.role)}
            </Text>
          </View>
          <View style={[styles.statusBadge, user.isActive ? styles.activeBadge : styles.inactiveBadge]}>
            <Text style={[styles.statusBadgeText, user.isActive ? styles.activeText : styles.inactiveText]}>
              {user.isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* Name fields (editable) */}
        <Text style={styles.sectionTitle}>Name</Text>
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>First Name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={(v) => { setFirstName(v); setSaveError(null); setSaveSuccess(false); }}
              placeholder="First name"
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={(v) => { setLastName(v); setSaveError(null); setSaveSuccess(false); }}
              placeholder="Last name"
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
        </View>

        {nameChanged && (
          <>
            {saveError ? <Text style={styles.formError}>{saveError}</Text> : null}
            {saveSuccess ? <Text style={styles.formSuccess}>Name saved.</Text> : null}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.disabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={theme.colors.white} />
                : <Text style={styles.saveButtonText}>Save Name</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* Email (read-only) */}
        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Email</Text>
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyValue}>{user.email}</Text>
          <Ionicons name="lock-closed-outline" size={14} color={theme.colors.grey1} />
        </View>

        {/* Entity (read-only) */}
        {user.entityName ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionSpaced]}>
              {user.role === 'stakeholder' ? 'Organisation' : 'State'}
            </Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyValue}>{user.entityName}</Text>
            </View>
          </>
        ) : null}

        {/* Action messages */}
        {actionMessage ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxText}>{actionMessage}</Text>
          </View>
        ) : null}
        {actionError ? (
          <Text style={styles.formError}>{actionError}</Text>
        ) : null}

        {/* Action buttons */}
        <View style={styles.actionsSection}>
          {showResetPassword && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonAmber, actionLoading && styles.disabled]}
              onPress={handleResetPassword}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading
                ? <ActivityIndicator color={theme.colors.white} size="small" />
                : <>
                    <Ionicons name="key-outline" size={16} color={theme.colors.white} style={styles.actionIcon} />
                    <Text style={styles.actionButtonText}>Reset Password</Text>
                  </>}
            </TouchableOpacity>
          )}

          {showDeactivate && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonGrey, actionLoading && styles.disabled]}
              onPress={() => handleToggleActive(false)}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading
                ? <ActivityIndicator color={theme.colors.white} size="small" />
                : <>
                    <Ionicons name="pause-circle-outline" size={16} color={theme.colors.white} style={styles.actionIcon} />
                    <Text style={styles.actionButtonText}>Deactivate Account</Text>
                  </>}
            </TouchableOpacity>
          )}

          {showReactivate && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonGreen, actionLoading && styles.disabled]}
              onPress={() => handleToggleActive(true)}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading
                ? <ActivityIndicator color={theme.colors.white} size="small" />
                : <>
                    <Ionicons name="play-circle-outline" size={16} color={theme.colors.white} style={styles.actionIcon} />
                    <Text style={styles.actionButtonText}>Reactivate Account</Text>
                  </>}
            </TouchableOpacity>
          )}
        </View>

        {/* Delete button — bottom, red */}
        {showDelete && (
          <View style={styles.deleteSection}>
            <TouchableOpacity
              style={[styles.deleteButton, actionLoading && styles.disabled]}
              onPress={handleDelete}
              disabled={actionLoading}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={16} color={theme.colors.white} style={styles.actionIcon} />
              <Text style={styles.deleteButtonText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: theme.PILL_NAV_BOTTOM_PADDING }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.error,
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: theme.colors.white,
    fontWeight: '600',
    fontSize: 14,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 14,
    backgroundColor: theme.colors.white,
    ...theme.shadows.header,
  },
  backButton: {
    width: 36,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.black,
  },
  headerSpacer: { width: 36 },

  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  // Badges
  badgeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  roleBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  activeBadge: { backgroundColor: theme.colors.greenMuted },
  inactiveBadge: { backgroundColor: theme.colors.inactive },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  activeText: { color: theme.colors.greenText },
  inactiveText: { color: theme.colors.grey2 },

  // Section titles
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.colors.grey1,
    marginBottom: 8,
  },
  sectionSpaced: { marginTop: 20 },

  // Name row
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: { flex: 1 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.grey2,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.black,
    ...theme.shadows.card,
  },

  // Save button
  saveButton: {
    marginTop: 14,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  saveButtonText: { color: theme.colors.white, fontSize: 15, fontWeight: '700' },

  // Read-only fields
  readOnlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    ...theme.shadows.card,
  },
  readOnlyValue: { fontSize: 15, color: theme.colors.grey2 },

  // Status messages
  formError: {
    fontSize: 13,
    color: theme.colors.error,
    marginTop: 10,
    textAlign: 'center',
  },
  formSuccess: {
    fontSize: 13,
    color: theme.colors.greenText,
    marginTop: 10,
    textAlign: 'center',
  },
  infoBox: {
    marginTop: 16,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 14,
  },
  infoBoxText: {
    fontSize: 13,
    color: '#92400e',
    lineHeight: 20,
    textAlign: 'center',
  },

  // Action buttons
  actionsSection: {
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    ...theme.shadows.card,
  },
  actionButtonAmber: { backgroundColor: '#d97706' },
  actionButtonGrey:  { backgroundColor: theme.colors.grey2 },
  actionButtonGreen: { backgroundColor: theme.colors.greenText },
  actionIcon: { marginRight: 8 },
  actionButtonText: { color: theme.colors.white, fontSize: 15, fontWeight: '600' },

  // Delete
  deleteSection: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: theme.colors.separator,
    paddingTop: 24,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    paddingVertical: 14,
    ...theme.shadows.card,
  },
  deleteButtonText: { color: theme.colors.white, fontSize: 15, fontWeight: '700' },

  disabled: { opacity: 0.6 },
});
