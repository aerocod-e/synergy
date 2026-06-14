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
import { searchVehicles } from '@/services/api';

export interface Vehicle {
  id: string;
  registrationNumber: string;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  value: string;
  onSelect: (vehicle: Vehicle) => void;
  onRegisterNew: (registrationNumber: string) => void;
  placeholder?: string;
}

export default function VehicleSearchInput({ value, onSelect, onRegisterNew, placeholder }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length === 0) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchVehicles(text.trim());
        setResults(data as Vehicle[]);
        setShowDropdown(true);
      } catch {
        setResults([]);
        setShowDropdown(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelect = (vehicle: Vehicle) => {
    setQuery(vehicle.registrationNumber);
    setShowDropdown(false);
    setResults([]);
    onSelect(vehicle);
  };

  const handleRegisterNew = () => {
    setShowDropdown(false);
    onRegisterNew(query.trim().toUpperCase());
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChange}
          placeholder={placeholder ?? 'Search registration number…'}
          placeholderTextColor={theme.colors.grey2}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color={theme.colors.primary} style={styles.spinner} />}
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          {results.map((vehicle) => (
            <TouchableOpacity
              key={vehicle.id}
              style={styles.dropdownRow}
              onPress={() => handleSelect(vehicle)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownText}>{vehicle.registrationNumber}</Text>
            </TouchableOpacity>
          ))}

          {query.trim().length > 0 && (
            <TouchableOpacity
              style={[styles.dropdownRow, styles.registerRow]}
              onPress={handleRegisterNew}
              activeOpacity={0.7}
            >
              <Text style={styles.registerText}>
                Register "{query.trim().toUpperCase()}" as new vehicle
              </Text>
            </TouchableOpacity>
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.grey3,
  },
  dropdownText: {
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '500',
  },
  registerRow: {
    backgroundColor: theme.colors.blueMuted,
  },
  registerText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
