import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { getStates, getStakeholders } from '@/services/api';
import type { State, Stakeholder } from '@/types/index';
import { theme } from '@/constants/theme';

export default function ConfigScreen() {
  const [states, setStates] = useState<State[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statesData, stakeholdersData] = await Promise.all([
        getStates(),
        getStakeholders(),
      ]);
      setStates(statesData.states ?? []);
      setStakeholders(stakeholdersData.stakeholders ?? []);
    } catch {
      setError('Failed to load configuration');
    }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => {
          setLoading(true);
          fetchData().finally(() => setLoading(false));
        }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.sectionLabel}>States ({states.length})</Text>
      {states.map((state) => (
        <View key={state.id} style={styles.item}>
          <Text style={styles.itemName}>{state.name}</Text>
          <View style={styles.codeBadge}>
            <Text style={styles.codeText}>{state.code}</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Stakeholders</Text>
      {stakeholders.length === 0 ? (
        <Text style={styles.emptyText}>No stakeholders found</Text>
      ) : (
        stakeholders.map((sh) => (
          <View key={sh.id} style={styles.item}>
            <View style={styles.stakeholderHeader}>
              <Text style={styles.itemName}>{sh.name}</Text>
              <View style={[styles.statusDot, sh.isActive ? styles.dotActive : styles.dotInactive]} />
            </View>
            {sh.description ? (
              <Text style={styles.description}>{sh.description}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingBottom: 88,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  sectionLabel: {
    ...theme.typography.sectionLabel,
    marginTop: 20,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  sectionLabelSpaced: {
    marginTop: 28,
  },
  item: {
    backgroundColor: theme.colors.white,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 16,
    padding: 16,
    ...theme.shadows.card,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.black,
  },
  codeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  codeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  stakeholderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive: { backgroundColor: theme.colors.green },
  dotInactive: { backgroundColor: theme.colors.inactive },
  description: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginTop: 6,
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.error,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: theme.colors.white, fontWeight: '600', fontSize: 14 },
  emptyText: {
    fontSize: 14,
    color: theme.colors.grey1,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
});
