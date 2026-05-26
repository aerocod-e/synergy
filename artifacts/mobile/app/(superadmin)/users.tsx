import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { getUsers } from '@/services/api';
import type { User } from '@/types/index';

function roleBadgeStyle(role: string) {
  if (role === 'super_admin') return styles.badgeSuperAdmin;
  if (role === 'driver') return styles.badgeDriver;
  return styles.badgeAdmin;
}

function roleLabel(user: User): string {
  if (user.role === 'super_admin') return 'Super Admin';
  if (user.role === 'driver') return 'Driver';
  if (user.role === 'admin' && user.entityType === 'state' && user.entityName) {
    return `State Admin — ${user.entityName}`;
  }
  if (user.role === 'admin' && user.entityType === 'stakeholder' && user.entityName) {
    return `Stakeholder Admin — ${user.entityName}`;
  }
  return 'Admin';
}

function UserRow({ user }: { user: User }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
        <View style={[styles.statusDot, user.isActive ? styles.dotActive : styles.dotInactive]} />
      </View>
      <View style={styles.badge}>
        <Text style={[styles.badgeText, roleBadgeStyle(user.role)]}>{roleLabel(user)}</Text>
      </View>
    </View>
  );
}

export default function UsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const data = await getUsers();
      setUsers(data.users ?? []);
    } catch {
      setError('Failed to load users');
    }
  }, []);

  useEffect(() => {
    fetchUsers().finally(() => setLoading(false));
  }, [fetchUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  }, [fetchUsers]);

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
          fetchUsers().finally(() => setLoading(false));
        }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (users.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No users found</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={users}
      keyExtractor={(u) => u.id}
      renderItem={({ item }) => <UserRow user={item} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a6ec8" />
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#ffffff' },
  listContent: { paddingVertical: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', padding: 24 },
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
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  email: { fontWeight: '700', fontSize: 14, color: '#111111', flex: 1, marginRight: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotActive: { backgroundColor: '#22c55e' },
  dotInactive: { backgroundColor: '#d1d5db' },
  badge: { alignSelf: 'flex-start' },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeSuperAdmin: { backgroundColor: '#374151', color: '#ffffff' },
  badgeAdmin: { backgroundColor: '#1a6ec8', color: '#ffffff' },
  badgeDriver: { backgroundColor: '#16a34a', color: '#ffffff' },
  errorText: { fontSize: 15, color: '#dc2626', marginBottom: 16, textAlign: 'center' },
  retryButton: {
    backgroundColor: '#1a6ec8',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  emptyText: { fontSize: 15, color: '#6b7280' },
});
