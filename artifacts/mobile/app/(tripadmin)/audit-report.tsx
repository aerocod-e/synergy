import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, CloudOff, FileText, FileSpreadsheet } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import { theme } from '@/constants/theme';
import TopBar from '@/components/TopBar';
import { getDriverAudit, getTripAdminAudit, getVehicleAudit } from '@/services/api';
import { formatNaira } from '@/utils/formatCurrency';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TripEntry {
  id: string;
  tripCode: string;
  date: string;
  loadingState:   string | null;
  unloadingState: string | null;
  status:         string;
  driverName:     string | null;
  vehicleReg:     string | null;
  totalFees:      number;
}

interface EntitySummary {
  totalTrips: number;
  completed: number;
  cancelled: number;
  inTransit: number;
  created: number;
  cancellationPending: number;
  totalRevenue: number;
  // trip-admin specific
  directCancellations?:   number;
  approvalCancellations?: number;
  approvalApproved?:      number;
  approvalRejected?:      number;
}

interface AuditEntity {
  id: string;
  displayName:    string;
  subLabel:       string | null;
  email:          string | null;
  dateRegistered: string;
  summary:        EntitySummary;
  trips:          TripEntry[];
}

interface AuditData {
  entities: AuditEntity[];
  summary:  EntitySummary;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  created:              'Created',
  in_transit:           'In Transit',
  completed:            'Completed',
  cancelled:            'Cancelled',
  cancellation_pending: 'Pending Cancel',
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  created:              { bg: theme.colors.blueMuted,  text: theme.colors.blueText },
  in_transit:           { bg: '#fef3c7',               text: '#d97706' },
  completed:            { bg: theme.colors.greenMuted, text: theme.colors.greenText },
  cancelled:            { bg: theme.colors.grey3,      text: theme.colors.grey1 },
  cancellation_pending: { bg: '#fff4ed',               text: '#ea580c' },
};

const ALL_STATUSES = ['created', 'in_transit', 'completed', 'cancelled', 'cancellation_pending'];

// ── Date preset helpers ───────────────────────────────────────────────────────

type Preset = 'all' | '7d' | '30d' | 'month' | 'lastmonth' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'all',       label: 'All time' },
  { key: '7d',        label: 'Last 7 days' },
  { key: '30d',       label: 'Last 30 days' },
  { key: 'month',     label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: 'custom',    label: 'Custom' },
];

const fmt = (d: Date) => d.toISOString().split('T')[0];

function computeDateRange(
  preset: Preset,
  customFrom: string,
  customTo: string,
): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  if (preset === '7d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { dateFrom: fmt(from), dateTo: fmt(now) };
  }
  if (preset === '30d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { dateFrom: fmt(from), dateTo: fmt(now) };
  }
  if (preset === 'month') {
    return { dateFrom: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: fmt(now) };
  }
  if (preset === 'lastmonth') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to   = new Date(now.getFullYear(), now.getMonth(), 0);
    return { dateFrom: fmt(from), dateTo: fmt(to) };
  }
  if (preset === 'custom') {
    return {
      dateFrom: customFrom.trim() || undefined,
      dateTo:   customTo.trim()   || undefined,
    };
  }
  return {};
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

function completionPct(s: EntitySummary): string {
  if (!s.totalTrips) return '0%';
  return Math.round((s.completed / s.totalTrips) * 100) + '%';
}

// ── Response normalizer ───────────────────────────────────────────────────────

function normalizeResponse(entityType: 'vehicle' | 'driver' | 'trip-admin', raw: any): AuditData {
  if (entityType === 'trip-admin') {
    return {
      entities: (raw.tripAdmins ?? []).map((ta: any) => ({
        id:             ta.id,
        displayName:    [ta.firstName, ta.lastName].filter(Boolean).join(' ') || ta.email,
        subLabel:       ta.email as string,
        email:          ta.email as string,
        dateRegistered: ta.dateOnboarded,
        summary:        ta.summary,
        trips:          (ta.trips ?? []).map((t: any) => ({ ...t, driverName: null })),
      })),
      summary: raw.summary,
    };
  }
  if (entityType === 'driver') {
    return {
      entities: (raw.drivers ?? []).map((d: any) => ({
        id:             d.id,
        displayName:    d.fullName   as string,
        subLabel:       d.licenseNumber ?? null,
        email:          null,
        dateRegistered: d.dateRegistered,
        summary:        d.summary,
        trips:          (d.trips ?? []).map((t: any) => ({ ...t, vehicleReg: t.vehicleReg ?? null, driverName: null })),
      })),
      summary: raw.summary,
    };
  }
  return {
    entities: (raw.vehicles ?? []).map((v: any) => ({
      id:             v.id,
      displayName:    v.registrationNumber as string,
      subLabel:       v.vehicleTypeName ?? null,
      email:          null,
      dateRegistered: v.dateRegistered,
      summary:        v.summary,
      trips:          (v.trips ?? []).map((t: any) => ({ ...t, vehicleReg: null })),
    })),
    summary: raw.summary,
  };
}

// ── PDF builder ───────────────────────────────────────────────────────────────

function buildHtml(data: AuditData, title: string, isSingle: boolean, entityType: 'vehicle' | 'driver' | 'trip-admin'): string {
  const isDriver    = entityType === 'driver';
  const isTripAdmin = entityType === 'trip-admin';

  const summaryBlock = (s: EntitySummary) => `
    <table class="summary">
      <tr><td>Total trips</td><td><b>${s.totalTrips}</b></td>
          <td>Completed</td><td><b>${s.completed}</b></td></tr>
      <tr><td>In transit</td><td><b>${s.inTransit}</b></td>
          <td>Created</td><td><b>${s.created}</b></td></tr>
      <tr><td>Cancelled</td><td><b>${s.cancelled}</b></td>
          <td>Pending cancel</td><td><b>${s.cancellationPending}</b></td></tr>
      <tr><td>Total revenue</td><td colspan="3"><b>${formatNaira(s.totalRevenue)}</b></td></tr>
      ${isTripAdmin && s.directCancellations !== undefined ? `
      <tr><td>Direct cancellations</td><td><b>${s.directCancellations}</b></td>
          <td>Via approval workflow</td><td><b>${s.approvalCancellations}</b></td></tr>
      <tr><td>Approval approved</td><td><b>${s.approvalApproved}</b></td>
          <td>Approval rejected</td><td><b>${s.approvalRejected}</b></td></tr>` : ''}
    </table>`;

  const secondaryCol = (isDriver || isTripAdmin) ? 'Vehicle' : 'Driver';
  const tripRows = (trips: TripEntry[]) => trips.map((t) => `
    <tr>
      <td>${t.tripCode ?? '—'}</td>
      <td>${fmtDate(t.date)}</td>
      <td>${t.loadingState ?? '—'} → ${t.unloadingState ?? '—'}</td>
      <td>${STATUS_LABELS[t.status] ?? t.status}</td>
      <td>${((isDriver || isTripAdmin) ? t.vehicleReg : t.driverName) ?? '—'}</td>
      <td>${formatNaira(t.totalFees)}</td>
    </tr>`).join('');

  const entitySections = isSingle
    ? ''
    : data.entities.map((e) => `
        <h3>${e.displayName}${e.subLabel && !isTripAdmin ? ' — ' + e.subLabel : ''}</h3>
        ${isTripAdmin && e.email ? `<p style="color:#444;font-size:13px">${e.email}</p>` : ''}
        <p style="color:#666;font-size:13px">Registered: ${fmtDate(e.dateRegistered)} &nbsp;|&nbsp;
          ${e.summary.totalTrips} trips &nbsp;|&nbsp; ${completionPct(e.summary)} completion &nbsp;|&nbsp;
          ${formatNaira(e.summary.totalRevenue)} revenue</p>
        ${summaryBlock(e.summary)}
        <table class="trips">
          <thead><tr><th>Code</th><th>Date</th><th>Route</th><th>Status</th><th>${secondaryCol}</th><th>Fees</th></tr></thead>
          <tbody>${tripRows(e.trips)}</tbody>
        </table>`).join('<hr/>');

  const singleSection = !isSingle ? '' : (() => {
    const e = data.entities[0];
    if (!e) return '';
    return `${summaryBlock(e.summary)}
      <table class="trips">
        <thead><tr><th>Code</th><th>Date</th><th>Route</th><th>Status</th><th>${secondaryCol}</th><th>Fees</th></tr></thead>
        <tbody>${tripRows(e.trips)}</tbody>
      </table>`;
  })();

  const reportType = isTripAdmin ? 'Trip Admin' : isDriver ? 'Driver' : 'Vehicle';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body{font-family:sans-serif;padding:24px;color:#111;}
    h1{font-size:20px;margin-bottom:4px;}
    h3{font-size:15px;margin:16px 0 4px;}
    p{margin:2px 0 8px;}
    table{width:100%;border-collapse:collapse;margin-bottom:12px;}
    table.summary td{padding:6px 10px;font-size:13px;border:1px solid #eee;}
    table.summary td:nth-child(odd){background:#f8f8f8;color:#666;}
    table.trips th{background:#1a6ec8;color:#fff;padding:7px 8px;font-size:12px;text-align:left;}
    table.trips td{padding:6px 8px;font-size:12px;border-bottom:1px solid #eee;}
    table.trips tr:nth-child(even) td{background:#f9fafb;}
    hr{border:none;border-top:1px solid #eee;margin:20px 0;}
    .meta{color:#666;font-size:13px;margin-bottom:16px;}
  </style></head><body>
  <h1>${reportType} Audit Report — ${title}</h1>
  <p class="meta">Generated: ${new Date().toLocaleString('en-NG')}</p>
  ${isSingle ? '' : '<h2 style="font-size:16px;margin-bottom:8px;">Combined Summary</h2>' + summaryBlock(data.summary) + '<hr/>'}
  ${singleSection}
  ${entitySections}
  </body></html>`;
}

// ── Excel builder ─────────────────────────────────────────────────────────────

function buildWorkbook(data: AuditData, isSingle: boolean, entityType: 'vehicle' | 'driver' | 'trip-admin'): XLSX.WorkBook {
  const wb        = XLSX.utils.book_new();
  const isDriver    = entityType === 'driver';
  const isTripAdmin = entityType === 'trip-admin';

  const summaryRows = (s: EntitySummary): (string | number)[][] => [
    ['SUMMARY'],
    ['Total Trips',          s.totalTrips],
    ['Completed',            s.completed],
    ['In Transit',           s.inTransit],
    ['Created',              s.created],
    ['Cancelled',            s.cancelled],
    ['Cancellation Pending', s.cancellationPending],
    ['Total Revenue (₦)',    s.totalRevenue / 100],
    ...(isTripAdmin ? [
      ['Direct Cancellations',   s.directCancellations   ?? 0],
      ['Via Approval Workflow',  s.approvalCancellations ?? 0],
      ['Approval Approved',      s.approvalApproved      ?? 0],
      ['Approval Rejected',      s.approvalRejected      ?? 0],
    ] : []),
    [],
  ];

  const secondaryHeader = (isDriver || isTripAdmin) ? 'Vehicle' : 'Driver';
  const tripHeaders = ['Trip Code', 'Date', 'Loading State', 'Unloading State', 'Status', secondaryHeader, 'Total Fees (₦)'];
  const tripRow = (t: TripEntry): (string | number)[] => [
    t.tripCode ?? '',
    fmtDate(t.date),
    t.loadingState ?? '',
    t.unloadingState ?? '',
    STATUS_LABELS[t.status] ?? t.status,
    ((isDriver || isTripAdmin) ? t.vehicleReg : t.driverName) ?? '',
    t.totalFees / 100,
  ];

  const entities = isSingle ? data.entities.slice(0, 1) : data.entities;

  for (const e of entities) {
    const sheetName = e.displayName
      .replace(/[:\\\/?*[\]]/g, '_')
      .slice(0, 31);
    const typeLabel = isTripAdmin ? 'Email' : isDriver ? 'License' : 'Vehicle Type';
    const regLabel  = isTripAdmin ? 'Date Onboarded' : 'Date Registered';
    const wsData: (string | number)[][] = [
      [`Audit — ${e.displayName}`],
      [typeLabel, e.subLabel ?? ''],
      [regLabel, fmtDate(e.dateRegistered)],
      [],
      ...summaryRows(e.summary),
      ['TRIPS'],
      tripHeaders,
      ...e.trips.map(tripRow),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  if (!isSingle && data.entities.length > 1) {
    const entityLabel   = isTripAdmin ? 'Trip Admin' : isDriver ? 'Driver' : 'Vehicle';
    const allSheetLabel = isTripAdmin ? 'All Trip Admins' : isDriver ? 'All Drivers' : 'All Vehicles';
    const subLabel      = isTripAdmin ? 'Email' : isDriver ? 'License' : 'Type';
    const wsData: (string | number)[][] = [
      [`Combined Summary — ${allSheetLabel}`],
      [],
      ...summaryRows(data.summary),
      [entityLabel, subLabel, 'Registered', 'Trips', 'Completed', 'Revenue (₦)'],
      ...data.entities.map((e) => [
        e.displayName,
        e.subLabel ?? '',
        fmtDate(e.dateRegistered),
        e.summary.totalTrips,
        e.summary.completed,
        e.summary.totalRevenue / 100,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, allSheetLabel);
  }

  return wb;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuditReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    entityType?:    string;
    vehicleId?:     string; vehicleReg?:    string;
    driverId?:      string; driverName?:    string;
    tripAdminId?:   string; tripAdminName?: string;
  }>();
  const entityType  = (params.entityType ?? 'vehicle') as 'vehicle' | 'driver' | 'trip-admin';
  const isDriver    = entityType === 'driver';
  const isTripAdmin = entityType === 'trip-admin';
  const entityId    = isTripAdmin ? params.tripAdminId : isDriver ? params.driverId   : params.vehicleId;
  const entityName  = isTripAdmin ? params.tripAdminName : isDriver ? params.driverName : params.vehicleReg;
  const isSingle    = !!entityId;
  const title       = isSingle
    ? (entityName ?? entityId ?? (isTripAdmin ? 'Trip Admin' : isDriver ? 'Driver' : 'Vehicle'))
    : (isTripAdmin ? 'All Trip Admins' : isDriver ? 'All Drivers' : 'All Vehicles');
  const backPath  = isTripAdmin
    ? '/(stateadmin)/trip-admins' as const
    : isDriver ? '/(tripadmin)/drivers' as const : '/(tripadmin)/vehicles' as const;
  const backLabel = isTripAdmin ? 'Trip Admins' : isDriver ? 'Drivers' : 'Vehicles';

  const [preset,     setPreset]     = useState<Preset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [data,    setData]    = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [exportingPdf,   setExportingPdf]   = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const fetchAudit = useCallback(async (
    p: Preset,
    cFrom: string,
    cTo: string,
    sf: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const qp: Record<string, string> = {};
      if (entityId) qp[isTripAdmin ? 'tripAdminId' : isDriver ? 'driverId' : 'vehicleId'] = entityId;
      if (sf)       qp.status = sf;
      const { dateFrom, dateTo } = computeDateRange(p, cFrom, cTo);
      if (dateFrom) qp.dateFrom = dateFrom;
      if (dateTo)   qp.dateTo   = dateTo;
      const apiCall = isTripAdmin ? getTripAdminAudit : isDriver ? getDriverAudit : getVehicleAudit;
      const result  = await apiCall(Object.keys(qp).length ? qp : undefined);
      setData(normalizeResponse(entityType, result as any));
    } catch {
      setError("Couldn't load audit data");
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, isDriver, isTripAdmin]);

  useEffect(() => {
    fetchAudit(preset, customFrom, customTo, statusFilter);
  }, [fetchAudit, preset, statusFilter]);

  const applyCustomRange = () => fetchAudit(preset, customFrom, customTo, statusFilter);

  // ── PDF export ──────────────────────────────────────────────────────────────
  const exportPdf = async () => {
    if (!data) return;
    setExportingPdf(true);
    try {
      const html = buildHtml(data, title, isSingle, entityType);
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.print();
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Audit Report PDF',
          UTI: 'com.adobe.pdf',
        });
      }
    } catch {
      Alert.alert('Export failed', 'Could not generate PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Excel export ────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    if (!data) return;
    setExportingExcel(true);
    try {
      const wb = buildWorkbook(data, isSingle, entityType);
      if (Platform.OS === 'web') {
        XLSX.writeFile(wb, `audit-report-${Date.now()}.xlsx`);
      } else {
        const bytes: Uint8Array = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const file = new File(Paths.cache, `audit-${Date.now()}.xlsx`);
        file.write(bytes);
        try {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Share Audit Report Excel',
            UTI: 'com.microsoft.excel.xlsx',
          });
        } finally {
          try { file.delete(); } catch { /* ignore cleanup errors */ }
        }
      }
    } catch {
      Alert.alert('Export failed', 'Could not generate Excel file. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderSummaryCards = (s: EntitySummary) => (
    <View style={styles.cardsGrid}>
      <View style={styles.card}>
        <Text style={styles.cardValue}>{s.totalTrips}</Text>
        <Text style={styles.cardLabel}>Total Trips</Text>
      </View>
      <View style={[styles.card, { borderLeftColor: theme.colors.greenText, borderLeftWidth: 3 }]}>
        <Text style={[styles.cardValue, { color: theme.colors.greenText }]}>{s.completed}</Text>
        <Text style={styles.cardLabel}>Completed</Text>
      </View>
      <View style={[styles.card, { borderLeftColor: '#d97706', borderLeftWidth: 3 }]}>
        <Text style={[styles.cardValue, { color: '#d97706' }]}>{s.inTransit}</Text>
        <Text style={styles.cardLabel}>In Transit</Text>
      </View>
      <View style={[styles.card, { borderLeftColor: theme.colors.blueText, borderLeftWidth: 3 }]}>
        <Text style={[styles.cardValue, { color: theme.colors.blueText }]}>{s.created}</Text>
        <Text style={styles.cardLabel}>Created</Text>
      </View>
      <View style={[styles.card, { borderLeftColor: theme.colors.error, borderLeftWidth: 3 }]}>
        <Text style={[styles.cardValue, { color: theme.colors.error }]}>{s.cancelled}</Text>
        <Text style={styles.cardLabel}>Cancelled</Text>
      </View>
      <View style={[styles.card, { borderLeftColor: '#ea580c', borderLeftWidth: 3 }]}>
        <Text style={[styles.cardValue, { color: '#ea580c' }]}>{s.cancellationPending}</Text>
        <Text style={styles.cardLabel}>Pending Cancel</Text>
      </View>
      <View style={[styles.card, styles.cardWide]}>
        <Text style={[styles.cardValue, { fontSize: 20 }]}>{formatNaira(s.totalRevenue)}</Text>
        <Text style={styles.cardLabel}>Total Revenue</Text>
      </View>
    </View>
  );

  const renderTripRow = (t: TripEntry) => {
    const ss = STATUS_STYLES[t.status] ?? { bg: theme.colors.grey3, text: theme.colors.grey1 };
    return (
      <View key={t.id} style={styles.tripRow}>
        <View style={styles.tripRowTop}>
          <Text style={styles.tripCode}>{t.tripCode ?? '—'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
            <Text style={[styles.statusBadgeText, { color: ss.text }]}>
              {STATUS_LABELS[t.status] ?? t.status}
            </Text>
          </View>
        </View>
        <Text style={styles.tripRoute}>
          {t.loadingState ?? '—'} → {t.unloadingState ?? '—'}
        </Text>
        <View style={styles.tripRowMeta}>
          <Text style={styles.tripMeta}>{fmtDate(t.date)}</Text>
          {(isDriver || isTripAdmin)
            ? (t.vehicleReg ? <Text style={styles.tripMeta}>{t.vehicleReg}</Text> : null)
            : (t.driverName ? <Text style={styles.tripMeta}>{t.driverName}</Text> : null)
          }
          <Text style={styles.tripFees}>{formatNaira(t.totalFees)}</Text>
        </View>
      </View>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <TopBar />
      <View style={styles.backRow}>
        {/* Back path is conditional: points to Drivers or Vehicles depending on which entity type opened this screen. */}
        <TouchableOpacity onPress={() => router.push(backPath)} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={22} color={theme.colors.primary} />
          <Text style={styles.backLabel}>{backLabel}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Title ── */}
        <View style={styles.titleRow}>
          <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
          <Text style={styles.titleSub}>{isTripAdmin ? 'Trip Admin' : isDriver ? 'Driver' : 'Vehicle'} Audit Report</Text>
        </View>

        {/* ── Date preset pills ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.presetPill, preset === p.key && styles.presetPillActive]}
                onPress={() => setPreset(p.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetText, preset === p.key && styles.presetTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* ── Custom date inputs ── */}
        {preset === 'custom' && (
          <View style={styles.customDateRow}>
            <View style={styles.customDateField}>
              <Text style={styles.customDateLabel}>From (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.customDateInput}
                value={customFrom}
                onChangeText={setCustomFrom}
                placeholder="2025-01-01"
                placeholderTextColor={theme.colors.placeholder}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.customDateField}>
              <Text style={styles.customDateLabel}>To (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.customDateInput}
                value={customTo}
                onChangeText={setCustomTo}
                placeholder="2025-12-31"
                placeholderTextColor={theme.colors.placeholder}
                keyboardType="numeric"
              />
            </View>
            <TouchableOpacity style={styles.applyBtn} onPress={applyCustomRange} activeOpacity={0.8}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Status filter pills ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusScroll}>
          <View style={styles.statusRow}>
            <TouchableOpacity
              style={[styles.statusPill, !statusFilter && styles.statusPillActive]}
              onPress={() => setStatusFilter('')}
              activeOpacity={0.7}
            >
              <Text style={[styles.statusPillText, !statusFilter && styles.statusPillTextActive]}>All</Text>
            </TouchableOpacity>
            {ALL_STATUSES.map((s) => {
              const ss = STATUS_STYLES[s] ?? { bg: theme.colors.grey3, text: theme.colors.grey1 };
              const isActive = statusFilter === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.statusPill,
                    isActive && { backgroundColor: ss.bg, borderColor: ss.text },
                  ]}
                  onPress={() => setStatusFilter(isActive ? '' : s)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.statusPillText, isActive && { color: ss.text, fontWeight: '700' }]}>
                    {STATUS_LABELS[s]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* ── Content ── */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <CloudOff size={40} color={theme.colors.inactive} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchAudit(preset, customFrom, customTo, statusFilter)}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !data ? null : (
          <>
            {/* ── Combined summary (multi-entity mode) ── */}
            {!isSingle && data.entities.length > 1 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>COMBINED SUMMARY</Text>
                {renderSummaryCards(data.summary)}
                {isTripAdmin && data.summary.directCancellations !== undefined && (
                  <View style={styles.cardsGrid}>
                    <View style={[styles.card, { borderLeftColor: theme.colors.error, borderLeftWidth: 3 }]}>
                      <Text style={[styles.cardValue, { color: theme.colors.error }]}>{data.summary.directCancellations}</Text>
                      <Text style={styles.cardLabel}>Direct Cancels</Text>
                    </View>
                    <View style={[styles.card, { borderLeftColor: '#7c3aed', borderLeftWidth: 3 }]}>
                      <Text style={[styles.cardValue, { color: '#7c3aed' }]}>{data.summary.approvalCancellations}</Text>
                      <Text style={styles.cardLabel}>Via Approval</Text>
                    </View>
                    <View style={[styles.card, { borderLeftColor: theme.colors.greenText, borderLeftWidth: 3 }]}>
                      <Text style={[styles.cardValue, { color: theme.colors.greenText }]}>{data.summary.approvalApproved}</Text>
                      <Text style={styles.cardLabel}>Approved</Text>
                    </View>
                    <View style={[styles.card, { borderLeftColor: theme.colors.grey1, borderLeftWidth: 3 }]}>
                      <Text style={[styles.cardValue, { color: theme.colors.grey1 }]}>{data.summary.approvalRejected}</Text>
                      <Text style={styles.cardLabel}>Rejected</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── Entity sections ── */}
            {isSingle ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>SUMMARY</Text>
                {data.entities[0] && renderSummaryCards(data.entities[0].summary)}
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
                  TRIPS ({data.entities[0]?.trips.length ?? 0})
                </Text>
                {data.entities[0]?.trips.length === 0 ? (
                  <Text style={styles.emptyText}>No trips match the selected filters.</Text>
                ) : (
                  data.entities[0]?.trips.map(renderTripRow)
                )}
              </View>
            ) : (
              data.entities.map((entity) => (
                <View key={entity.id} style={styles.section}>
                  <View style={styles.vehicleHeader}>
                    {isTripAdmin ? (
                      <View>
                        <Text style={styles.driverNameLabel}>{entity.displayName}</Text>
                        {entity.email ? <Text style={styles.vehicleType}>{entity.email}</Text> : null}
                      </View>
                    ) : isDriver ? (
                      <>
                        <Text style={styles.driverNameLabel}>{entity.displayName}</Text>
                        {entity.subLabel ? <Text style={styles.vehicleType}>{entity.subLabel}</Text> : null}
                      </>
                    ) : (
                      <>
                        <View style={styles.plateBadge}>
                          <Text style={styles.plateText}>{entity.displayName}</Text>
                        </View>
                        {entity.subLabel ? (
                          <Text style={styles.vehicleType}>{entity.subLabel}</Text>
                        ) : null}
                      </>
                    )}
                  </View>
                  <Text style={styles.vehicleSubMeta}>
                    {entity.summary.totalTrips} trips · {completionPct(entity.summary)} completion · {formatNaira(entity.summary.totalRevenue)}
                  </Text>
                  {renderSummaryCards(entity.summary)}
                  {isTripAdmin && entity.summary.directCancellations !== undefined && (
                    <View style={styles.cardsGrid}>
                      <View style={[styles.card, { borderLeftColor: theme.colors.error, borderLeftWidth: 3 }]}>
                        <Text style={[styles.cardValue, { color: theme.colors.error }]}>{entity.summary.directCancellations}</Text>
                        <Text style={styles.cardLabel}>Direct Cancels</Text>
                      </View>
                      <View style={[styles.card, { borderLeftColor: '#7c3aed', borderLeftWidth: 3 }]}>
                        <Text style={[styles.cardValue, { color: '#7c3aed' }]}>{entity.summary.approvalCancellations}</Text>
                        <Text style={styles.cardLabel}>Via Approval</Text>
                      </View>
                      <View style={[styles.card, { borderLeftColor: theme.colors.greenText, borderLeftWidth: 3 }]}>
                        <Text style={[styles.cardValue, { color: theme.colors.greenText }]}>{entity.summary.approvalApproved}</Text>
                        <Text style={styles.cardLabel}>Approved</Text>
                      </View>
                      <View style={[styles.card, { borderLeftColor: theme.colors.grey1, borderLeftWidth: 3 }]}>
                        <Text style={[styles.cardValue, { color: theme.colors.grey1 }]}>{entity.summary.approvalRejected}</Text>
                        <Text style={styles.cardLabel}>Rejected</Text>
                      </View>
                    </View>
                  )}
                  <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
                    TRIPS ({entity.trips.length})
                  </Text>
                  {entity.trips.length === 0 ? (
                    <Text style={styles.emptyText}>No trips match the selected filters.</Text>
                  ) : (
                    entity.trips.map(renderTripRow)
                  )}
                </View>
              ))
            )}

            {/* ── Export buttons ── */}
            <View style={styles.exportRow}>
              <TouchableOpacity
                style={[styles.exportBtn, exportingPdf && styles.exportBtnDisabled]}
                onPress={exportPdf}
                disabled={exportingPdf || exportingExcel}
                activeOpacity={0.8}
              >
                {exportingPdf
                  ? <ActivityIndicator size="small" color={theme.colors.white} />
                  : <><FileText size={18} color={theme.colors.white} /><Text style={styles.exportBtnText}>Export PDF</Text></>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportBtn, styles.exportBtnGreen, exportingExcel && styles.exportBtnDisabled]}
                onPress={exportExcel}
                disabled={exportingPdf || exportingExcel}
                activeOpacity={0.8}
              >
                {exportingExcel
                  ? <ActivityIndicator size="small" color={theme.colors.white} />
                  : <><FileSpreadsheet size={18} color={theme.colors.white} /><Text style={styles.exportBtnText}>Export Excel</Text></>
                }
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: theme.PILL_NAV_BOTTOM_PADDING }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingRight: 12,
  },
  backLabel: {
    fontSize: 15,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  titleRow: {
    marginBottom: 14,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.black,
  },
  titleSub: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginTop: 2,
  },
  presetScroll: {
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  presetPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
  },
  presetPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  presetText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  presetTextActive: {
    color: theme.colors.white,
  },
  customDateRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  customDateField: {
    flex: 1,
    gap: 4,
  },
  customDateLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.grey1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  customDateInput: {
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
    color: theme.colors.black,
  },
  applyBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.white,
  },
  statusScroll: {
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.grey3,
  },
  statusPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.grey2,
  },
  statusPillTextActive: {
    color: theme.colors.white,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  errorBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.grey2,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.white,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    ...theme.typography.sectionLabel,
    marginBottom: 10,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  plateBadge: {
    backgroundColor: theme.colors.blueMuted,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  plateText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.blueText,
    letterSpacing: 1,
  },
  driverNameLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.black,
  },
  vehicleType: {
    fontSize: 13,
    color: theme.colors.grey1,
    fontWeight: '500',
  },
  vehicleSubMeta: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginBottom: 12,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 10,
    padding: 12,
    flexBasis: '47%',
    flexGrow: 1,
    ...theme.shadows.card,
  },
  cardWide: {
    flexBasis: '100%',
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.black,
  },
  cardLabel: {
    fontSize: 12,
    color: theme.colors.grey1,
    marginTop: 2,
    fontWeight: '500',
  },
  tripRow: {
    backgroundColor: theme.colors.white,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 5,
    ...theme.shadows.card,
  },
  tripRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tripCode: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.black,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tripRoute: {
    fontSize: 13,
    color: theme.colors.grey2,
    fontWeight: '500',
  },
  tripRowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripMeta: {
    fontSize: 12,
    color: theme.colors.grey1,
  },
  tripFees: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.blueText,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.grey1,
    textAlign: 'center',
    paddingVertical: 20,
  },
  exportRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  exportBtnGreen: {
    backgroundColor: theme.colors.greenText,
  },
  exportBtnDisabled: {
    opacity: 0.6,
  },
  exportBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.white,
  },
});
