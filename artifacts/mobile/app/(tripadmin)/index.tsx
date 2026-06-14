import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

export default function TripAdminTrips() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Trips — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  text: {
    color: theme.colors.grey1,
    fontSize: 16,
    fontWeight: '500',
  },
});
