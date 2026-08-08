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
  vehicleTypeId?: string;
  vehicleTypeName?: string | null;
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
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const handleChange = (text: string) => {
    setQuery(text);
    setSearchError(null);
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
        setSearchError(null);
        setShowDropdown(true);
      } catch (err: any) {
        console.error('[VehicleSearchInput] searchVehicles failed:', err);
        setSearchError(err?.message ?? 'Search failed — type to try again');
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
    setSearchError(null);
    onSelect(vehicle);
  };

  const handleRegisterNew = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResults([]);
    setShowDropdown(false);
    setSearchError(null);
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
          maxLength={50}
        />
        {loading && <ActivityIndicator size="small" color={theme.colors.primary} style={styles.spinner} />}
      </View>

      {searchError && !showDropdown && (
        <Text style={styles.errorText}>{searchError}</Text>
      )}

      {showDropdown && (
        <View style={styles.dropdown}>
          {searchError && (
            <View style={styles.errorRow}>
              <Text style={styles.errorRowText}>{searchError}</Text>
            </View>
          )}
          {results.map((vehicle) => (
            <TouchableOpacity
              key={vehicle.id}
              style={styles.dropdownRow}
              onPress={() => handleSelect(vehicle)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownText}>{vehicle.registrationNumber}</Text>
              {vehicle.vehicleTypeName ? (
                <Text style={styles.dropdownSubText}>{vehicle.vehicleTypeName}</Text>
              ) : null}
            </TouchableOpacity>
          ))}

          {results.length === 0 && query.trim().length > 0 && (
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
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 6,
    marginLeft: 4,
  },
  dropdown: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.white,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  errorRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff5f5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.grey3,
  },
  errorRowText: {
    fontSize: 13,
    color: theme.colors.error,
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
  dropdownSubText: {
    fontSize: 12,
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
});
