import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { ChevronDown, ChevronUp, ListFilter, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface Props {
  activeFilterCount: number;
  summaryText: string | null;
  onClearAll: () => void;
  children: React.ReactNode;
  style?: any;
}

export default function FilterPanel({ activeFilterCount, summaryText, onClearAll, children, style }: Props) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const handleClearAll = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onClearAll();
  };

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity style={styles.filterButton} onPress={toggleExpanded} activeOpacity={0.75}>
        <ListFilter size={15} color={theme.colors.grey2} />
        <Text style={styles.filterButtonText}>Filters</Text>
        {activeFilterCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeFilterCount}</Text>
          </View>
        )}
        {expanded ? (
          <ChevronUp size={16} color={theme.colors.grey2} />
        ) : (
          <ChevronDown size={16} color={theme.colors.grey2} />
        )}
      </TouchableOpacity>

      {!expanded && activeFilterCount > 0 && summaryText ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText} numberOfLines={1}>
            {summaryText}
          </Text>
          <TouchableOpacity
            onPress={handleClearAll}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Clear filters"
          >
            <X size={15} color={theme.colors.grey1} />
          </TouchableOpacity>
        </View>
      ) : null}

      {expanded ? <View style={styles.panel}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.white,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.inactive,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  badge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.white,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.blueMuted,
    borderRadius: 10,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
    flex: 1,
    marginRight: 8,
  },
  panel: {
    marginTop: 10,
  },
});
