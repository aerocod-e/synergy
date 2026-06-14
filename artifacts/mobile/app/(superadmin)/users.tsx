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
import { theme } from '@/constants/theme';

function getRoleBadgeColors(role: string): { bg: string; text: string } {
  if (role === 'super_admin') return theme.colors.roleColors.super_admin;
  if (role === 'state_admin') return theme.colors.roleColors.state_admin;
  if (role === 'trip_admin') return theme.colors.roleColors.trip_admin;
  return theme.colors.roleColors.stakeholder;
}

function roleLabel(user: User): string {
  if (user.role === 'super_admin') return 'Super Admin';
  if (user.role === 'state_admin') return user.entityName ? `State Admin — ${user.entityName}` : 'State Admin';
  if (user.role === 'trip_admin') return user.entityName ? `Trip Admin — ${user.entityName}` : 'Trip Admin';
  if (user.role === 'stakeholder') return user.entityName ? `Stakeholder — ${user.entityName}` : 'Stakeholder';
  return user.role;
}

function UserRow({ user }: { user: User }) {
  const badgeColors = getRoleBadgeColors(user.role);
  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
        <View style={[styles.statusDot, user.isActive ? styles.dotActive : styles.dotInactive]} />
      </View>
      <View style={[styles.roleBadge, { backgroundColor: badgeColors.bg }]}>
        <Text style={[styles.roleBadgeText, { color: badgeColors.text }]}>{roleLabel(user)}</Text>
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
      }
      ListHeaderComponent={
        <Text style={styles.sectionLabel}>All Users</Text>
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
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
  item: {
    backgroundColor: theme.colors.white,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 16,
    padding: 16,
    ...theme.shadows.card,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  email: {
    fontWeight: '700',
    fontSize: 14,
    color: theme.colors.black,
    flex: 1,
    marginRight: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive: { backgroundColor: theme.colors.green },
  dotInactive: { backgroundColor: theme.colors.inactive },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
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
  emptyText: { fontSize: 15, color: theme.colors.grey1 },
});
