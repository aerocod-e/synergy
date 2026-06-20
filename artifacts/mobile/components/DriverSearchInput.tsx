import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { theme } from '@/constants/theme';
import { searchDrivers, createDriver } from '@/services/api';

export interface Driver {
  id: string;
  fullName: string;
  licenseNumber: string;
  phoneNumber: string;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  value: string;
  onSelect: (driver: Driver) => void;
  placeholder?: string;
}

export default function DriverSearchInput({ value, onSelect, placeholder }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [regName, setRegName] = useState('');
  const [regLicense, setRegLicense] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const handleChange = (text: string) => {
    setQuery(text);
    setShowRegisterForm(false);
    setRegisterError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length === 0) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchDrivers(text.trim());
        setResults(data as Driver[]);
        setShowDropdown(true);
      } catch {
        setResults([]);
        setShowDropdown(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelect = (driver: Driver) => {
    setQuery(driver.fullName);
    setShowDropdown(false);
    setResults([]);
    setShowRegisterForm(false);
    onSelect(driver);
  };

  const handleOpenRegisterForm = () => {
    setShowRegisterForm(true);
    setRegisterError(null);
    setRegName('');
    setRegLicense('');
    setRegPhone('');
  };

  const handleSubmitRegister = async () => {
    if (!regName.trim() || !regLicense.trim() || !regPhone.trim()) {
      setRegisterError('All three fields are required.');
      return;
    }
    setRegistering(true);
    setRegisterError(null);
    try {
      const created = await createDriver({
        full_name: regName.trim(),
        license_number: regLicense.trim(),
        phone_number: regPhone.trim(),
      });
      const driver = created as Driver;
      setQuery(driver.fullName);
      setShowDropdown(false);
      setShowRegisterForm(false);
      setResults([]);
      onSelect(driver);
    } catch (err: any) {
      if (err?.error === 'CONFLICT') {
        setRegisterError('A driver with this license number already exists. Search for them above.');
      } else {
        setRegisterError(err?.message ?? 'Failed to register driver.');
      }
    } finally {
      setRegistering(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChange}
          placeholder={placeholder ?? 'Search by name, license, or phone…'}
          placeholderTextColor={theme.colors.grey2}
          autoCorrect={false}
        />
        {loading && (
          <ActivityIndicator size="small" color={theme.colors.primary} style={styles.spinner} />
        )}
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          {results.map((driver) => (
            <TouchableOpacity
              key={driver.id}
              style={styles.dropdownRow}
              onPress={() => handleSelect(driver)}
              activeOpacity={0.7}
            >
              <Text style={styles.driverName}>{driver.fullName}</Text>
              <Text style={styles.driverSub}>
                {driver.licenseNumber} · {driver.phoneNumber}
              </Text>
            </TouchableOpacity>
          ))}

          {results.length === 0 && !showRegisterForm && (
            <TouchableOpacity
              style={[styles.dropdownRow, styles.registerRow]}
              onPress={handleOpenRegisterForm}
              activeOpacity={0.7}
            >
              <Text style={styles.registerText}>Register new driver…</Text>
            </TouchableOpacity>
          )}

          {showRegisterForm && (
            <View style={styles.registerForm}>
              <TextInput
                style={styles.formInput}
                value={regName}
                onChangeText={setRegName}
                placeholder="Full Name"
                placeholderTextColor={theme.colors.grey1}
                autoCorrect={false}
              />
              <TextInput
                style={styles.formInput}
                value={regLicense}
                onChangeText={setRegLicense}
                placeholder="License Number"
                placeholderTextColor={theme.colors.grey1}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TextInput
                style={styles.formInput}
                value={regPhone}
                onChangeText={setRegPhone}
                placeholder="Phone Number"
                placeholderTextColor={theme.colors.grey1}
                keyboardType="phone-pad"
                autoCorrect={false}
              />

              {registerError && (
                <Text style={styles.formError}>{registerError}</Text>
              )}

              {registering ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary}
                  style={{ marginTop: 10, alignSelf: 'center' }}
                />
              ) : (
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleSubmitRegister}
                  activeOpacity={0.85}
                >
                  <Text style={styles.submitBtnText}>Register Driver</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    borderRadius: 12,
    backgroundColor: theme.colors.white,
    paddingHorizontal: 14,
    height: 52,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '500',
  },
  spinner: {
    marginLeft: 8,
  },
  dropdown: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.white,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  dropdownRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.grey3,
  },
  driverName: {
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '600',
  },
  driverSub: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginTop: 2,
  },
  registerRow: {
    backgroundColor: theme.colors.blueMuted,
  },
  registerText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  registerForm: {
    padding: 14,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.grey3,
  },
  formInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.black,
    backgroundColor: theme.colors.background,
  },
  formError: {
    fontSize: 13,
    color: theme.colors.error,
    marginTop: 2,
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.white,
  },
});
