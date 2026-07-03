import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: any;
}

export default function SearchBar({ value, onChangeText, placeholder = 'Search…', style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <Search size={17} color={theme.colors.grey1} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.grey1}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Clear search">
          <X size={16} color={theme.colors.grey1} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.inactive,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.black,
    padding: 0,
  },
});
