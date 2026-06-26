import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Briefcase,
  Building2,
  CloudOff,
  Map,
  ShieldCheck,
  User,
  Users,
  Wallet,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import ScreenTransition from '@/components/ScreenTransition';
import SlideUpList from '@/components/SlideUpList';
import { formatNaira } from '@/utils/formatCurrency';
import { getUsers, getStates, getStakeholders, getActivePricingChart, getAllWallets } from '@/services/api';

interface DashboardData {
  stateAdmins: number;
  tripAdmins: number;
  stakeholderUsers: number;
  statesCount: number;
  stakeholdersCount: number;
  grandTotal: number;
  pricing: {
    vehicleTypeCount: number;
    stakeholderCount: number;
  } | null;
}

function SkeletonCard({ wide = false }: { wide?: boolean }) {
  return (
    <View style={[styles.card, wide && styles.cardWide]}>
      <View style={[styles.skeletonBlock, { width: 36, height: 36, borderRadius: 18, marginBottom: 10 }]} />
      <View style={[styles.skeletonBlock, { width: 60, height: 26, marginBottom: 6 }]} />
      <View style={[styles.skeletonBlock, { width: '70%', height: 13 }]} />
    </View>
  );
}

interface SummaryCardProps {
  icon: ComponentType<{ size?: number; color?: string; style?: any }>;
  iconColor?: string;
  value: string;
  label: string;
  wide?: boolean;
  valueColor?: string;
}

function SummaryCard({ icon: Icon, iconColor, value, label, wide = false, valueColor }: SummaryCardProps) {
  if (wide) {
    return (
      <View style={[styles.card, styles.cardWide]}>
        <Icon size={32} color={iconColor ?? theme.colors.primary} />
        <View style={styles.cardWideContent}>
          <Text style={[styles.cardValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
          <Text style={styles.cardLabel}>{label}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Icon size={26} color={iconColor ?? theme.colors.primary} style={styles.cardIcon} />
      <Text style={[styles.cardValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setHasError(false);

    const [usersRes, statesRes, stakeholdersRes, pricingRes, walletsRes] = await Promise.allSettled([
      getUsers(),
      getStates(),
      getStakeholders(),
      getActivePricingChart(),
      getAllWallets(),
    ]);

    const anySucceeded = [usersRes, statesRes, stakeholdersRes, pricingRes, walletsRes].some(
      (r) => r.status === 'fulfilled',
    );
    if (!anySucceeded) {
      setHasError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const users: any[] = usersRes.status === 'fulfilled'
      ? (usersRes.value?.users ?? [])
      : [];

    const states: any[] = statesRes.status === 'fulfilled'
      ? (statesRes.value?.states ?? (Array.isArray(statesRes.value) ? statesRes.value : []))
      : [];

    const stakeholders: any[] = stakeholdersRes.status === 'fulfilled'
      ? (stakeholdersRes.value?.stakeholders ?? (Array.isArray(stakeholdersRes.value) ? stakeholdersRes.value : []))
      : [];

    const chart = pricingRes.status === 'fulfilled' ? pricingRes.value?.chart : null;

    const walletSummary = walletsRes.status === 'fulfilled' ? walletsRes.value?.summary : null;

    setData({
      stateAdmins:       users.filter((u) => u.role === 'state_admin').length,
      tripAdmins:        users.filter((u) => u.role === 'trip_admin').length,
      stakeholderUsers:  users.filter((u) => u.role === 'stakeholder').length,
      statesCount:       states.length,
      stakeholdersCount: stakeholders.length,
      grandTotal:        walletSummary?.grandTotal ?? 0,
      pricing: chart
        ? {
            vehicleTypeCount: (chart.vehicleTypeRates as any[])?.length ?? 0,
            stakeholderCount: (() => {
              const ids = new Set<string>();
              ((chart.vehicleTypeRates as any[]) ?? []).forEach((vtr: any) => {
                (vtr.stakeholderRates ?? []).forEach((sr: any) => ids.add(sr.stakeholderId));
              });
              return ids.size;
            })(),
          }
        : null,
    });

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading && !refreshing) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionLabel}>USERS</Text>
        <View style={styles.grid}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
        <View style={styles.grid}>
          <SkeletonCard />
        </View>
        <Text style={styles.sectionLabel}>PLATFORM</Text>
        <View style={styles.grid}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
        <SkeletonCard wide />
        <Text style={styles.sectionLabel}>ACTIVE PRICING CHART</Text>
        <View style={styles.grid}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
        <SkeletonCard wide />
      </ScrollView>
    );
  }

  if (hasError) {
    return (
      <View style={styles.centered}>
        <CloudOff size={48} color={theme.colors.inactive} />
        <Text style={styles.errorText}>Failed to load dashboard</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchDashboard()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar />
      <ScreenTransition style={{ flex: 1 }}>
      <SlideUpList style={{ flex: 1 }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => fetchDashboard(true)}
          tintColor={theme.colors.primary}
        />
      }
    >
      <Text style={styles.sectionLabel}>USERS</Text>
      <View style={styles.grid}>
        <SummaryCard
          icon={ShieldCheck}
          value={String(data?.stateAdmins ?? '—')}
          label="State Admins"
        />
        <SummaryCard
          icon={User}
          value={String(data?.tripAdmins ?? '—')}
          label="Trip Admins"
        />
      </View>
      <View style={styles.grid}>
        <SummaryCard
          icon={Briefcase}
          iconColor="#15803d"
          value={String(data?.stakeholderUsers ?? '—')}
          label="Stakeholder Users"
        />
      </View>

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>PLATFORM</Text>
      <View style={styles.grid}>
        <SummaryCard
          icon={Map}
          value={String(data?.statesCount ?? '—')}
          label="States"
        />
        <SummaryCard
          icon={Building2}
          iconColor="#d97706"
          value={String(data?.stakeholdersCount ?? '—')}
          label="Stakeholders"
        />
      </View>
      <SummaryCard
        icon={Wallet}
        iconColor="#15803d"
        value={data != null ? formatNaira(data.grandTotal) : '—'}
        label="Platform Grand Total Collected"
        wide
        valueColor="#15803d"
      />

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>ACTIVE PRICING CHART</Text>
      {data?.pricing == null ? (
        <View style={[styles.card, styles.cardWide, styles.noPricingCard]}>
          <AlertTriangle size={22} color="#d97706" />
          <Text style={styles.noPricingText}>No active pricing chart configured</Text>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            <SummaryCard
              icon={ArrowUpCircle}
              value={`${data.pricing.vehicleTypeCount}`}
              label="Vehicle Types"
            />
            <SummaryCard
              icon={Users}
              iconColor="#d97706"
              value={`${data.pricing.stakeholderCount}`}
              label="Stakeholders with Rates"
            />
          </View>
          <SummaryCard
            icon={ArrowDownCircle}
            iconColor="#6b7280"
            value="Tap Config to manage rates"
            label="Fees &amp; stakeholder rates are set per vehicle type"
            wide
          />
        </>
      )}
    </ScrollView>
      </SlideUpList>
      </ScreenTransition>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: theme.PILL_NAV_BOTTOM_PADDING,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: theme.colors.grey1,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  sectionLabelSpaced: {
    marginTop: 20,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'flex-start',
    ...theme.shadows.card,
  },
  cardWide: {
    flex: 0,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  cardWideContent: {
    flex: 1,
    gap: 2,
  },
  cardIcon: {
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.black,
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 12,
    color: theme.colors.grey1,
    lineHeight: 16,
  },
  skeletonBlock: {
    backgroundColor: '#0d0d0d',
    opacity: 0.1,
    borderRadius: 6,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.grey1,
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
  noPricingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noPricingText: {
    fontSize: 14,
    color: '#d97706',
    fontWeight: '600',
    flex: 1,
  },
});
