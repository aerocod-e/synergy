import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthContext } from '@/app/_layout';
import { theme } from '@/constants/theme';
import { changePassword } from '@/services/api';

function roleBadgeLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin: 'Super Admin',
    state_admin: 'State Admin',
    trip_admin: 'Trip Admin',
    stakeholder: 'Stakeholder',
  };
  return labels[role] ?? role;
}

function roleBadgeColors(role: string): { bg: string; text: string } {
  return (
    (theme.colors.roleColors as Record<string, { bg: string; text: string }>)[role] ?? {
      bg: theme.colors.grey4,
      text: theme.colors.grey2,
    }
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuthContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  const role = user?.role ?? '';
  const badgeColors = roleBadgeColors(role);

  const newPwTooShort = newPw.length > 0 && newPw.length < 8;
  const pwMismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const canSave =
    currentPw.length > 0 && newPw.length >= 8 && newPw === confirmPw;

  const handleSavePassword = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw });
      setSaveSuccess(true);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e: any) {
      setSaveError(e?.message ?? 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24 }]}
      >
        {/* Back */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>

        {/* User info */}
        {fullName ? (
          <Text style={styles.fullName}>{fullName}</Text>
        ) : null}
        <Text style={[styles.emailText, !fullName && styles.emailLarge]}>
          {user?.email}
        </Text>
        <View style={[styles.roleBadge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.roleBadgeText, { color: badgeColors.text }]}>
            {roleBadgeLabel(role)}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* Change Password */}
        <Text style={styles.sectionTitle}>Change Password</Text>

        <TextInput
          style={styles.input}
          placeholder="Current Password"
          placeholderTextColor={theme.colors.placeholder}
          secureTextEntry
          value={currentPw}
          onChangeText={setCurrentPw}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={[styles.input, styles.inputSpaced]}
          placeholder="New Password"
          placeholderTextColor={theme.colors.placeholder}
          secureTextEntry
          value={newPw}
          onChangeText={(t) => { setNewPw(t); setSaveSuccess(false); setSaveError(null); }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {newPwTooShort && (
          <Text style={styles.fieldError}>New password must be at least 8 characters</Text>
        )}

        <TextInput
          style={[styles.input, styles.inputSpaced]}
          placeholder="Confirm New Password"
          placeholderTextColor={theme.colors.placeholder}
          secureTextEntry
          value={confirmPw}
          onChangeText={(t) => { setConfirmPw(t); setSaveSuccess(false); setSaveError(null); }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {pwMismatch && (
          <Text style={styles.fieldError}>Passwords do not match</Text>
        )}

        {saveError ? (
          <Text style={styles.fieldError}>{saveError}</Text>
        ) : null}

        {saveSuccess ? (
          <Text style={styles.successText}>Password changed successfully</Text>
        ) : null}

        <TouchableOpacity
          style={[styles.saveBtn, (!canSave || saving) && styles.btnDisabled]}
          onPress={handleSavePassword}
          disabled={!canSave || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save Password</Text>
          )}
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.85}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>v1.0.0</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 60 },
  headerRow: { marginBottom: 24 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontSize: 15, color: theme.colors.primary, fontWeight: '600' },
  fullName: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 4,
  },
  emailText: {
    fontSize: 14,
    color: theme.colors.grey1,
    marginBottom: 12,
  },
  emailLarge: {
    fontSize: 18,
    color: theme.colors.black,
    fontWeight: '600',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 4,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '600' },
  divider: {
    height: 1,
    backgroundColor: theme.colors.separator,
    marginVertical: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 16,
  },
  input: {
    backgroundColor: theme.colors.grey4,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: theme.colors.black,
  },
  inputSpaced: { marginTop: 12 },
  fieldError: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 6,
  },
  successText: {
    fontSize: 13,
    color: theme.colors.green,
    marginTop: 8,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  btnDisabled: { opacity: 0.5 },
  saveBtnText: { color: theme.colors.white, fontSize: 15, fontWeight: '700' },
  signOutBtn: {
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  signOutText: { color: theme.colors.white, fontSize: 15, fontWeight: '700' },
  version: {
    fontSize: 12,
    color: theme.colors.grey1,
    textAlign: 'center',
    marginTop: 24,
  },
});
