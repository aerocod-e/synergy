import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '@/app/_layout';

interface DemoAccount {
  label: string;
  email: string;
  password: string;
  badge: string;
  badgeColor: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'Super Admin',
    email: 'superadmin@synergy.com',
    password: 'Admin@1234',
    badge: 'Super Admin',
    badgeColor: '#7C3AED',
  },
  {
    label: 'Admin — Alpha Stakeholder',
    email: 'alpha.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'Stakeholder Admin',
    badgeColor: '#1a6ec8',
  },
  {
    label: 'Admin — Beta Stakeholder',
    email: 'beta.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'Stakeholder Admin',
    badgeColor: '#1a6ec8',
  },
  {
    label: 'Admin — Gamma Stakeholder',
    email: 'gamma.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'Stakeholder Admin',
    badgeColor: '#1a6ec8',
  },
  {
    label: 'Admin — Lagos State',
    email: 'lagos.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  {
    label: 'Admin — Kano State',
    email: 'kano.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  {
    label: 'Admin — Rivers State',
    email: 'rivers.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  {
    label: 'Admin — FCT Abuja',
    email: 'fct.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  {
    label: 'Admin — Ogun State',
    email: 'ogun.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  {
    label: 'Driver 1',
    email: 'driver1@synergy.com',
    password: 'Driver@1234',
    badge: 'Driver',
    badgeColor: '#059669',
  },
  {
    label: 'Driver 2',
    email: 'driver2@synergy.com',
    password: 'Driver@1234',
    badge: 'Driver',
    badgeColor: '#059669',
  },
];

export default function LoginScreen() {
  const { login, isLoading } = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [demoOpen, setDemoOpen] = useState(false);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (error) setError('');
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (error) setError('');
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }

    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? 'Login failed. Please try again.');
    }
  };

  const handleSelectDemo = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
    setDemoOpen(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.inner}>
          <View style={styles.header}>
            <Text style={styles.appName}>Synergy Cargo</Text>
            <Text style={styles.subtitle}>Fleet management, simplified</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={handleEmailChange}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.demoTrigger}
              onPress={() => setDemoOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.demoTriggerText}>Demo account</Text>
              <Ionicons name="chevron-down" size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={demoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDemoOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setDemoOpen(false)}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Demo accounts</Text>
              <TouchableOpacity onPress={() => setDemoOpen(false)}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {DEMO_ACCOUNTS.map((account) => (
                <TouchableOpacity
                  key={account.email}
                  style={styles.demoRow}
                  onPress={() => handleSelectDemo(account)}
                  activeOpacity={0.6}
                >
                  <View style={styles.demoRowLeft}>
                    <Text style={styles.demoLabel}>{account.label}</Text>
                    <Text style={styles.demoEmail}>{account.email}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: account.badgeColor + '1A' }]}>
                    <Text style={[styles.badgeText, { color: account.badgeColor }]}>
                      {account.badge}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'Inter_700Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    fontFamily: 'Inter_400Regular',
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    fontFamily: 'Inter_400Regular',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  demoTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  demoTriggerText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'Inter_400Regular',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    fontFamily: 'Inter_600SemiBold',
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  demoRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  demoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    fontFamily: 'Inter_500Medium',
    marginBottom: 2,
  },
  demoEmail: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'Inter_400Regular',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
});
