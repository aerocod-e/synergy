import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { getMyWallet } from '@/services/api';
import { formatNaira } from '@/utils/formatCurrency';

interface Wallet {
  id: string;
  ownerType: string;
  ownerId: string;
  totalCollected: number;
  totalCollectedNaira: string;
}

function SkeletonBlock({ width, height, borderRadius = 6 }: { width: number | string; height: number; borderRadius?: number }) {
  return <View style={[styles.skeletonBlock, { width: width as number, height, borderRadius }]} />;
}

function WalletSkeleton() {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <SkeletonBlock width={80} height={12} />
        <SkeletonBlock width={180} height={44} borderRadius={8} />
        <View style={styles.splitRow}>
          <View style={styles.splitHalf}>
            <SkeletonBlock width={60} height={11} />
            <SkeletonBlock width={90} height={18} borderRadius={6} />
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitHalf}>
            <SkeletonBlock width={60} height={11} />
            <SkeletonBlock width={90} height={18} borderRadius={6} />
          </View>
        </View>
      </View>
      <View style={styles.infoCard}>
        <SkeletonBlock width={120} height={13} />
        <View style={styles.infoRow}>
          <SkeletonBlock width={80} height={13} />
          <SkeletonBlock width={100} height={13} />
        </View>
        <View style={styles.infoRow}>
          <SkeletonBlock width={70} height={13} />
          <SkeletonBlock width={140} height={13} />
        </View>
      </View>
      <View style={[styles.ledgerButton, { opacity: 0.35 }]}>
        <SkeletonBlock width={160} height={16} borderRadius={6} />
      </View>
    </ScrollView>
  );
}

export default function AdminWallet() {
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchWallet = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const data = await getMyWallet();
      setWallet(data?.wallet ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  if (loading && !refreshing) {
    return <WalletSkeleton />;
  }

  if (error) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.errorText}>Failed to load wallet</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchWallet()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => fetchWallet(true)} />
      }
    >
      {/* Hero balance card */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>MY WALLET</Text>
        <Text style={styles.heroAmount}>
          {wallet ? formatNaira(wallet.totalCollected) : '₦0.00'}
        </Text>
        <Text style={styles.heroSubLabel}>Total Collected</Text>
        <View style={styles.splitRow}>
          <View style={styles.splitHalf}>
            <Text style={styles.splitLabel}>Cleared</Text>
            <Text style={styles.splitValue}>₦0.00</Text>
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitHalf}>
            <Text style={styles.splitLabel}>Pending</Text>
            <Text style={styles.splitValue}>
              {wallet ? formatNaira(wallet.totalCollected) : '₦0.00'}
            </Text>
          </View>
        </View>
      </View>

      {/* Entity info card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>ACCOUNT INFO</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Entity Type</Text>
          <Text style={styles.infoValue}>
            {wallet?.ownerType ? wallet.ownerType.charAt(0).toUpperCase() + wallet.ownerType.slice(1) : '—'}
          </Text>
        </View>
        <View style={styles.separator} />
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Entity ID</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {wallet?.ownerId ?? '—'}
          </Text>
        </View>
      </View>

      {/* Navigate to Ledger */}
      <TouchableOpacity
        style={styles.ledgerButton}
        activeOpacity={0.82}
        onPress={() => router.push('/(admin)/ledger')}
      >
        <Text style={styles.ledgerButtonText}>View Full Ledger →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    ...theme.shadows.strong,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: theme.colors.white,
    letterSpacing: -1,
  },
  heroSubLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 4,
    marginBottom: 20,
  },
  splitRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  splitHalf: {
    flex: 1,
    alignItems: 'center',
  },
  splitDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 2,
  },
  splitLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  splitValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.white,
  },
  infoCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    ...theme.shadows.card,
  },
  infoCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: theme.colors.grey1,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoKey: {
    fontSize: 14,
    color: theme.colors.grey1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
    maxWidth: '60%',
    textAlign: 'right',
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.separator,
    marginVertical: 2,
  },
  ledgerButton: {
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    ...theme.shadows.card,
  },
  ledgerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.error,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
  },
  retryButtonText: {
    color: theme.colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  skeletonBlock: {
    backgroundColor: theme.colors.black,
    opacity: 0.12,
    marginVertical: 4,
  },
});
