import { Eye, EyeOff, Search, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '@/app/_layout';
import { theme } from '@/constants/theme';

interface DemoAccount {
  label: string;
  email: string;
  password: string;
  badge: string;
  badgeColor: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  // Super Admin
  {
    label: 'Super Admin',
    email: 'superadmin@synergy.com',
    password: 'Admin@1234',
    badge: 'Super Admin',
    badgeColor: '#7C3AED',
  },
  // State Admins
  {
    label: 'Lagos State Admin',
    email: 'lagos.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  {
    label: 'Kano State Admin',
    email: 'kano.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  {
    label: 'Rivers State Admin',
    email: 'rivers.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  {
    label: 'FCT State Admin',
    email: 'fct.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  {
    label: 'Ogun State Admin',
    email: 'ogun.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'State Admin',
    badgeColor: '#0891B2',
  },
  // Trip Admins
  {
    label: 'Lagos Trip Admin 1',
    email: 'lagos.ta1@synergy.com',
    password: 'Demo@1234',
    badge: 'Trip Admin',
    badgeColor: '#059669',
  },
  {
    label: 'Lagos Trip Admin 2',
    email: 'lagos.ta2@synergy.com',
    password: 'Demo@1234',
    badge: 'Trip Admin',
    badgeColor: '#059669',
  },
  {
    label: 'Kano Trip Admin',
    email: 'kano.ta1@synergy.com',
    password: 'Demo@1234',
    badge: 'Trip Admin',
    badgeColor: '#059669',
  },
  {
    label: 'Rivers Trip Admin',
    email: 'rivers.ta1@synergy.com',
    password: 'Demo@1234',
    badge: 'Trip Admin',
    badgeColor: '#059669',
  },
  {
    label: 'FCT Trip Admin',
    email: 'fct.ta1@synergy.com',
    password: 'Demo@1234',
    badge: 'Trip Admin',
    badgeColor: '#059669',
  },
  {
    label: 'Ogun Trip Admin',
    email: 'ogun.ta1@synergy.com',
    password: 'Demo@1234',
    badge: 'Trip Admin',
    badgeColor: '#059669',
  },
  // Stakeholders
  {
    label: 'Consultant',
    email: 'alpha.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'Stakeholder',
    badgeColor: '#1a6ec8',
  },
  {
    label: 'Vendor',
    email: 'beta.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'Stakeholder',
    badgeColor: '#1a6ec8',
  },
  {
    label: 'Integrator',
    email: 'gamma.admin@synergy.com',
    password: 'Admin@1234',
    badge: 'Stakeholder',
    badgeColor: '#1a6ec8',
  },
];

export default function LoginScreen() {
  const { login, isLoading } = useAuthContext();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [demoVisible, setDemoVisible] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(400)).current;
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      if (err?.error === 'FORBIDDEN') {
        setError('This account has been deactivated. Please contact your administrator.');
      } else {
        setError(err?.message ?? 'Login failed. Please try again.');
      }
    }
  };

  const openDemo = () => {
    setDemoVisible(true);
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(400);
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }),
    ]).start();
  };

  const closeDemo = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: 400, duration: 200, useNativeDriver: true }),
    ]).start(() => setDemoVisible(false));
  };

  const handleSelectDemo = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
    closeDemo();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.inner}>
          <View style={styles.header}>
            <Text style={styles.appName}>Synergy Systems</Text>
            <Text style={styles.subtitle}>Cargo Tax Management</Text>
          </View>

          <View style={styles.formCard}>
            <TextInput
              style={[styles.input, emailFocused && styles.inputFocused]}
              placeholder="Email"
              placeholderTextColor={theme.colors.placeholder}
              value={email}
              onChangeText={handleEmailChange}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />

            <View style={[styles.passwordWrapper, passwordFocused && styles.inputFocused]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor={theme.colors.placeholder}
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
                activeOpacity={0.7}
              >
                {showPassword ? <EyeOff size={20}
                  color={theme.colors.grey1} /> : <Eye size={20}
                  color={theme.colors.grey1} />}
              </TouchableOpacity>
            </View>

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
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.demoTrigger}
              onPress={openDemo}
              activeOpacity={0.7}
            >
              <Text style={styles.demoTriggerText}>Use a demo account</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.publicLookupLink}
            onPress={() => router.push('/(public)/lookup')}
            activeOpacity={0.7}
          >
            <Search size={14} color={theme.colors.primary} />
            <Text style={styles.publicLookupText}>Verify a trip payment</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      <Modal
        visible={demoVisible}
        transparent
        animationType="none"
        onRequestClose={closeDemo}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: overlayOpacity }]}
          pointerEvents="none"
        />
        <View style={styles.overlayLayout} pointerEvents="box-none">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeDemo} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Demo accounts</Text>
              <TouchableOpacity onPress={closeDemo}>
                <X size={20} color={theme.colors.grey1} />
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
                  <View style={[styles.demoBadge, { backgroundColor: account.badgeColor + '1A' }]}>
                    <Text style={[styles.demoBadgeText, { color: account.badgeColor }]}>
                      {account.badge}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 24,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: theme.colors.black,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.grey1,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 24,
    padding: 28,
    marginHorizontal: 24,
    gap: 12,
    ...theme.shadows.card,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    color: theme.colors.black,
    borderWidth: 0,
  },
  inputFocused: {
    backgroundColor: theme.colors.grey3,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    height: 52,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    color: theme.colors.black,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    height: 52,
    justifyContent: 'center',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    ...theme.shadows.strong,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  demoTrigger: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  demoTriggerText: {
    fontSize: 13,
    color: theme.colors.grey1,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  overlayLayout: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.white,
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
    borderBottomColor: theme.colors.separator,
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.black,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  demoRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  demoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.black,
    marginBottom: 2,
  },
  demoEmail: {
    fontSize: 12,
    color: theme.colors.grey1,
  },
  demoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  demoBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  publicLookupLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
  },
  publicLookupText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500',
  },
});
