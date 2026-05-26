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
        <ActivityIndicator size="large" color="#1a6ec8" />
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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>States ({states.length})</Text>
      {states.map((state) => (
        <View key={state.id} style={styles.item}>
          <Text style={styles.itemName}>{state.name}</Text>
          <View style={styles.codeBadge}>
            <Text style={styles.codeText}>{state.code}</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Stakeholders</Text>
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
  scroll: { flex: 1, backgroundColor: '#ffffff' },
  scrollContent: { paddingVertical: 12, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', padding: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  sectionTitleSpaced: { marginTop: 24 },
  item: {
    backgroundColor: '#f5f5f5',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemName: { fontSize: 14, fontWeight: '600', color: '#111111' },
  codeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  codeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  stakeholderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotActive: { backgroundColor: '#22c55e' },
  dotInactive: { backgroundColor: '#d1d5db' },
  description: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  errorText: { fontSize: 15, color: '#dc2626', marginBottom: 16, textAlign: 'center' },
  retryButton: {
    backgroundColor: '#1a6ec8',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  emptyText: { fontSize: 14, color: '#6b7280', paddingHorizontal: 16, paddingVertical: 8 },
});
