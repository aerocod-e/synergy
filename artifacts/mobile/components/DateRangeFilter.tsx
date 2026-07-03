import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Calendar, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import DateField from '@/components/DateField';

export type DateRangePreset = '7d' | '30d' | 'all' | 'custom';

export interface DateRangeValue {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
}

interface Props {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

const PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom Range' },
];

function presetToDates(preset: DateRangePreset): { startDate?: string; endDate?: string } {
  if (preset === 'all' || preset === 'custom') return {};
  const days = preset === '7d' ? 7 : 30;
  const now = new Date();
  const past = new Date();
  past.setDate(now.getDate() - days);
  return {
    startDate: past.toISOString().split('T')[0]!,
    endDate: now.toISOString().split('T')[0]!,
  };
}

export function getDateRangeParams(value: DateRangeValue): Record<string, string> {
  const params: Record<string, string> = {};
  if (value.startDate) params.startDate = value.startDate;
  if (value.endDate) params.endDate = value.endDate;
  return params;
}

export default function DateRangeFilter({ value, onChange }: Props) {
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [draftStart, setDraftStart] = useState(value.startDate ?? '');
  const [draftEnd, setDraftEnd] = useState(value.endDate ?? '');

  const handlePresetPress = (preset: DateRangePreset) => {
    if (preset === 'custom') {
      setDraftStart(value.startDate ?? '');
      setDraftEnd(value.endDate ?? '');
      setCustomModalVisible(true);
      return;
    }
    onChange({ preset, ...presetToDates(preset) });
  };

  const applyCustom = () => {
    onChange({ preset: 'custom', startDate: draftStart || undefined, endDate: draftEnd || undefined });
    setCustomModalVisible(false);
  };

  const customLabel =
    value.preset === 'custom' && value.startDate && value.endDate
      ? `${value.startDate} → ${value.endDate}`
      : 'Custom Range';

  return (
    <>
      <View style={styles.row}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.chip, value.preset === p.key && styles.chipActive]}
            onPress={() => handlePresetPress(p.key)}
            activeOpacity={0.75}
          >
            <Calendar size={13} color={value.preset === p.key ? theme.colors.primary : theme.colors.grey1} />
            <Text style={[styles.chipText, value.preset === p.key && styles.chipTextActive]} numberOfLines={1}>
              {p.key === 'custom' ? customLabel : p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal
        visible={customModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Custom Date Range</Text>
            <TouchableOpacity onPress={() => setCustomModalVisible(false)} accessibilityLabel="Close">
              <X size={22} color={theme.colors.grey2} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>FROM</Text>
            <DateField value={draftStart} onChange={setDraftStart} placeholder="Start date" />
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>TO</Text>
            <DateField value={draftEnd} onChange={setDraftEnd} placeholder="End date" />
            <TouchableOpacity
              style={[styles.applyBtn, (!draftStart || !draftEnd) && styles.applyBtnDisabled]}
              onPress={applyCustom}
              disabled={!draftStart || !draftEnd}
              activeOpacity={0.85}
            >
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.inactive,
    maxWidth: 170,
  },
  chipActive: {
    backgroundColor: theme.colors.blueMuted,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  chipTextActive: {
    color: theme.colors.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: theme.colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.black,
  },
  modalBody: {
    padding: 20,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.grey1,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  applyBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  applyBtnDisabled: {
    opacity: 0.5,
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.white,
  },
});
