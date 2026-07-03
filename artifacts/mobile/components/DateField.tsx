import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import { theme } from '@/constants/theme';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: any;
}

function parseISODate(value: string): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplay(value: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  return parseISODate(value).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function DateField({ value, onChange, placeholder = 'Select date', style }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(parseISODate(value));

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webWrapper, style]}>
        {/* @ts-ignore - native HTML date input on web */}
        <input
          type="date"
          value={value || ''}
          onChange={(e: any) => onChange(e.target.value)}
          style={webInputStyle}
        />
        <Calendar size={18} color={theme.colors.grey1} style={styles.webIcon} />
      </View>
    );
  }

  const openPicker = () => {
    setTempDate(parseISODate(value));
    setShowPicker(true);
  };

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'set' && selectedDate) {
        onChange(toISODate(selectedDate));
      }
      return;
    }
    if (selectedDate) setTempDate(selectedDate);
  };

  const confirmIOS = () => {
    onChange(toISODate(tempDate));
    setShowPicker(false);
  };

  const cancelIOS = () => setShowPicker(false);

  return (
    <>
      <TouchableOpacity style={[styles.field, style]} onPress={openPicker} activeOpacity={0.7}>
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Calendar size={18} color={theme.colors.grey1} />
      </TouchableOpacity>

      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker value={tempDate} mode="date" display="default" onChange={handleChange} />
      )}

      {showPicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" visible={showPicker} onRequestClose={cancelIOS}>
          <View style={styles.iosOverlay}>
            <View style={styles.iosSheet}>
              <View style={styles.iosSheetHeader}>
                <TouchableOpacity onPress={cancelIOS}>
                  <Text style={styles.iosCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIOS}>
                  <Text style={styles.iosDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleChange}
                textColor={theme.colors.black}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const webInputStyle: any = {
  flex: 1,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 15,
  color: theme.colors.black,
  fontFamily: 'inherit',
};

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.separator,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  valueText: {
    fontSize: 15,
    color: theme.colors.black,
  },
  placeholderText: {
    fontSize: 15,
    color: theme.colors.grey1,
  },
  webWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.separator,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  webIcon: {
    marginLeft: 8,
  },
  iosOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  iosSheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  iosSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  iosCancel: {
    fontSize: 16,
    color: theme.colors.grey1,
  },
  iosDone: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
