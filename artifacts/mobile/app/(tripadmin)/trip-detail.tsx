import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { theme } from '@/constants/theme';
import { getTripById, startTrip, completeTrip, markTripBreakdown, markTransshipment } from '@/services/api';
import TripDetailView, { type TripDetail } from '@/components/TripDetailView';
import { formatNaira } from '@/utils/formatCurrency';
import { confirmAction, notifyAction } from '@/utils/confirmAction';
import { TRIP_ADMIN_STATUS_LABELS, TRIP_STATUS } from '@/constants/tripStatus';
import VehicleSearchInput, { type Vehicle } from '@/components/VehicleSearchInput';
import DriverSearchInput, { type Driver } from '@/components/DriverSearchInput';

// ── Share helpers ────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * On iOS, `Sharing.shareAsync` can fail to resolve/reject when the native
 * share sheet is dismissed without the user picking a share option. This
 * races the real share promise against a timeout so UI loading state is
 * never left stuck. The real promise is still allowed to settle in the
 * background afterwards; any late result/error is only logged, not surfaced.
 */
const shareWithTimeout = async (
  sharePromise: Promise<unknown>,
  timeoutMs = 3000,
  label = 'Share'
): Promise<void> => {
  let timedOut = false;
  await Promise.race([sharePromise, sleep(timeoutMs).then(() => { timedOut = true; })]);
  if (timedOut) {
    sharePromise.catch((error) => {
      console.error(`${label} settled after timeout with an error:`, error);
    });
  }
};

const STATUS_LABELS = TRIP_ADMIN_STATUS_LABELS;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Proof of Payment PDF builder ─────────────────────────────────────────────

function buildProofOfPaymentHtml(trip: TripDetail, includeZeroFee: boolean): string {
  const statusLabel = STATUS_LABELS[trip.status as keyof typeof STATUS_LABELS] ?? trip.status;
  const isCancelled = trip.status === TRIP_STATUS.CANCELLED;

  const paidFees = trip.fees.filter((f) => f.feeType !== 'cancellation_reversal');
  const total = paidFees.reduce((sum, f) => sum + f.amount, 0);

  const paidRows = paidFees.map((f) => `
    <tr>
      <td>${f.recipientName ?? '—'}</td>
      <td class="status-paid">Paid</td>
      <td>${formatNaira(f.amount)}</td>
    </tr>`).join('');

  const paidStakeholderNames = new Set(
    paidFees.filter((f) => f.recipientType === 'stakeholder').map((f) => f.recipientName)
  );
  const zeroFeeRows = includeZeroFee
    ? (trip.vehicleTypeStakeholderRates ?? [])
        .filter((r) => r.amount === 0 && !paidStakeholderNames.has(r.stakeholderName))
        .map((r) => `
    <tr>
      <td>${r.stakeholderName}</td>
      <td class="status-nofee">Not Applicable</td>
      <td>—</td>
    </tr>`).join('')
    : '';

  const breakdownSection = isCancelled
    ? `<div class="cancel-banner">
        This trip was cancelled. Any fees previously allocated for this trip have been reversed.
      </div>`
    : `<table class="fees">
        <thead><tr><th>Party</th><th>Status</th><th>Amount</th></tr></thead>
        <tbody>
          ${paidRows}
          ${zeroFeeRows}
        </tbody>
        <tfoot><tr><td>Total Paid</td><td></td><td><b>${formatNaira(total)}</b></td></tr></tfoot>
      </table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body{font-family:sans-serif;padding:24px;color:#111;}
    h1{font-size:20px;margin-bottom:4px;}
    p{margin:2px 0 8px;}
    .meta{color:#666;font-size:13px;margin-bottom:16px;}
    .badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#e8f0fb;color:#1a6ec8;}
    table{width:100%;border-collapse:collapse;margin-bottom:12px;}
    table.details td{padding:6px 10px;font-size:13px;border:1px solid #eee;}
    table.details td:nth-child(odd){background:#f8f8f8;color:#666;width:35%;}
    table.fees th{background:#1a6ec8;color:#fff;padding:7px 8px;font-size:12px;text-align:left;}
    table.fees td{padding:6px 8px;font-size:12px;border-bottom:1px solid #eee;}
    table.fees tfoot td{font-size:13px;padding:8px;border-top:2px solid #111;}
    .status-paid{color:#059669;font-weight:600;}
    .status-nofee{color:#999;}
    .cancel-banner{background:#fef2f2;color:#991b1b;padding:14px;border-radius:8px;font-size:13px;margin-bottom:16px;}
    .footer{color:#666;font-size:11px;margin-top:24px;border-top:1px solid #eee;padding-top:12px;}
  </style></head><body>
  <h1>Proof of Payment</h1>
  <p class="meta">Trip Code: <b>${trip.tripCode ?? '—'}</b> &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-NG')} &nbsp;|&nbsp; <span class="badge">${statusLabel}</span></p>

  <table class="details">
    <tr><td>Driver</td><td>${trip.driver?.fullName ?? 'No driver assigned'}</td></tr>
    <tr><td>Driver License</td><td>${trip.driver?.licenseNumber ?? '—'}</td></tr>
    <tr><td>Vehicle Registration</td><td>${trip.vehicleNumber}</td></tr>
    <tr><td>Vehicle Type</td><td>${trip.vehicleTypeName ?? '—'}</td></tr>
    <tr><td>Loading State</td><td>${trip.loadingState.name}</td></tr>
    <tr><td>Unloading State</td><td>${trip.unloadingState.name}</td></tr>
  </table>

  ${breakdownSection}

  </body></html>`;
}

export default function TripAdminTripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [includeZeroFee, setIncludeZeroFee] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [replacementVehicle, setReplacementVehicle] = useState<Vehicle | null>(null);
  const [vehicleInputValue, setVehicleInputValue] = useState('');
  const [replacementDriver, setReplacementDriver] = useState<Driver | null>(null);
  const [driverInputValue, setDriverInputValue] = useState('');
  const [transshipmentLoading, setTransshipmentLoading] = useState(false);
  const [transshipmentError, setTransshipmentError] = useState<string | null>(null);

  const fetchTrip = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const data = await getTripById(id);
      setTrip(data.trip as TripDetail);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const handleStart = () => {
    confirmAction({
      title: 'Mark as In Transit',
      message: 'Are you sure you want to mark this trip as In Transit? This confirms the driver has started the journey.',
      confirmText: 'Confirm',
      onConfirm: async () => {
        setActionLoading(true);
        setActionError(null);
        try {
          await startTrip(id!);
          await fetchTrip();
        } catch (err: any) {
          setActionError(err?.message ?? 'Failed to update trip status. Please try again.');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleComplete = () => {
    confirmAction({
      title: 'Mark as Completed',
      message: 'Are you sure you want to mark this trip as Completed? This confirms the delivery has been made.',
      confirmText: 'Confirm',
      onConfirm: async () => {
        setActionLoading(true);
        setActionError(null);
        try {
          await completeTrip(id!);
          await fetchTrip();
        } catch (err: any) {
          setActionError(err?.message ?? 'Failed to update trip status. Please try again.');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleMarkBreakdown = () => {
    confirmAction({
      title: 'Mark as Breakdown',
      message: 'Are you sure you want to mark this trip as Broken Down? You will then need to select a replacement vehicle and/or driver.',
      confirmText: 'Confirm',
      onConfirm: async () => {
        setActionLoading(true);
        setActionError(null);
        try {
          await markTripBreakdown(id!);
          await fetchTrip();
        } catch (err: any) {
          setActionError(err?.message ?? 'Failed to mark trip as broken down. Please try again.');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleConfirmTransshipment = () => {
    if (!replacementVehicle && !replacementDriver) return;
    confirmAction({
      title: 'Confirm Transshipment',
      message: 'Are you sure you want to confirm this replacement? The trip will move to Transshipment status.',
      confirmText: 'Confirm',
      onConfirm: async () => {
        setTransshipmentLoading(true);
        setTransshipmentError(null);
        try {
          await markTransshipment(id!, {
            newVehicleId: replacementVehicle?.id,
            newDriverId: replacementDriver?.id,
          });
          setReplacementVehicle(null);
          setVehicleInputValue('');
          setReplacementDriver(null);
          setDriverInputValue('');
          await fetchTrip();
        } catch (err: any) {
          setTransshipmentError(err?.message ?? 'Failed to record transshipment. Please try again.');
        } finally {
          setTransshipmentLoading(false);
        }
      },
    });
  };

  const exportProofOfPayment = async () => {
    if (!trip) return;
    setExportingPdf(true);
    try {
      const html = buildProofOfPaymentHtml(trip, includeZeroFee);
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.print();
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const sharePromise = Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Proof of Payment PDF',
          UTI: 'com.adobe.pdf',
        });
        await shareWithTimeout(sharePromise, 3000, 'PDF share');
      }
    } catch (error) {
      console.error('Proof of payment export failed:', error);
      notifyAction('Export failed', 'Could not generate PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <ChevronLeft size={24} color={theme.colors.primary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Trip Details</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centered}>
          <AlertCircle size={48} color={theme.colors.inactive} />
          <Text style={styles.errorText}>Failed to load trip</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchTrip}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const verifyFooter = (
    <>
      {trip.tripCode && (
        <TouchableOpacity
          style={styles.verifyRow}
          onPress={() => router.push(`/(public)/lookup?q=${encodeURIComponent(trip.tripCode!)}`)}
          activeOpacity={0.7}
        >
          <Search size={18} color={theme.colors.primary} />
          <Text style={styles.verifyRowText}>Verify this trip's payment status</Text>
          <ChevronRight size={16} color={theme.colors.grey1} />
        </TouchableOpacity>
      )}

      <View style={styles.pdfSection}>
        <View style={styles.pdfToggleRow}>
          <Text style={styles.pdfToggleLabel}>Include zero-fee parties</Text>
          <Switch
            value={includeZeroFee}
            onValueChange={setIncludeZeroFee}
            trackColor={{ false: theme.colors.separator, true: theme.colors.primary }}
            thumbColor={theme.colors.white}
          />
        </View>
        <TouchableOpacity
          style={[styles.pdfButton, exportingPdf && styles.actionBtnDisabled]}
          onPress={exportProofOfPayment}
          disabled={exportingPdf}
          activeOpacity={0.8}
        >
          {exportingPdf
            ? <ActivityIndicator size="small" color={theme.colors.primary} />
            : (
              <>
                <Download size={18} color={theme.colors.primary} />
                <Text style={styles.pdfButtonText}>Download Proof of Payment</Text>
              </>
            )
          }
        </TouchableOpacity>
      </View>
    </>
  );

  const showActions =
    trip.status === TRIP_STATUS.CREATED ||
    trip.status === TRIP_STATUS.IN_TRANSIT ||
    trip.status === TRIP_STATUS.TRANSSHIPMENT_IN_TRANSIT;
  const showReplacementSection = trip.status === TRIP_STATUS.BREAKDOWN;
  const canConfirmTransshipment = Boolean(replacementVehicle || replacementDriver);

  return (
    <View style={styles.root}>
      {header}
      <TripDetailView trip={trip} footer={verifyFooter} />

      {showActions && (
        <View style={styles.actionsContainer}>
          {actionError && (
            <View style={styles.actionErrorBox}>
              <AlertCircle size={16} color={theme.colors.error} />
              <Text style={styles.actionErrorText}>{actionError}</Text>
            </View>
          )}

          {trip.status === TRIP_STATUS.CREATED && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnGreen, actionLoading && styles.actionBtnDisabled]}
              onPress={handleStart}
              disabled={actionLoading}
              activeOpacity={0.8}
            >
              {actionLoading
                ? <ActivityIndicator size="small" color={theme.colors.white} />
                : <Text style={styles.actionBtnText}>Mark as In Transit</Text>
              }
            </TouchableOpacity>
          )}

          {(trip.status === TRIP_STATUS.IN_TRANSIT || trip.status === TRIP_STATUS.TRANSSHIPMENT_IN_TRANSIT) && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnGreen, actionLoading && styles.actionBtnDisabled]}
              onPress={handleComplete}
              disabled={actionLoading}
              activeOpacity={0.8}
            >
              {actionLoading
                ? <ActivityIndicator size="small" color={theme.colors.white} />
                : <Text style={styles.actionBtnText}>Mark as Completed</Text>
              }
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnAmber, actionLoading && styles.actionBtnDisabled]}
            onPress={handleMarkBreakdown}
            disabled={actionLoading}
            activeOpacity={0.8}
          >
            {actionLoading
              ? <ActivityIndicator size="small" color={theme.colors.white} />
              : <Text style={styles.actionBtnText}>Mark as Breakdown</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {showReplacementSection && (
        <View style={styles.replacementContainer}>
          <Text style={styles.replacementTitle}>Select Replacement</Text>
          <Text style={styles.replacementSubtitle}>
            This trip broke down. Select a replacement vehicle and/or driver to continue.
          </Text>

          <View style={styles.replacementCurrentRow}>
            <Text style={styles.replacementCurrentLabel}>Current vehicle</Text>
            <Text style={styles.replacementCurrentValue}>{trip.vehicleNumber}</Text>
          </View>
          <View style={styles.replacementCurrentRow}>
            <Text style={styles.replacementCurrentLabel}>Current driver</Text>
            <Text style={styles.replacementCurrentValue}>{trip.driver?.fullName ?? 'No driver assigned'}</Text>
          </View>

          <Text style={styles.replacementFieldLabel}>REPLACEMENT VEHICLE</Text>
          <VehicleSearchInput
            value={vehicleInputValue}
            onSelect={(vehicle) => {
              setReplacementVehicle(vehicle);
              setVehicleInputValue(vehicle.registrationNumber);
            }}
            onRegisterNew={() => {
              notifyAction('Vehicle not found', 'Please register new vehicles from the trip creation screen first.');
            }}
            placeholder="Search replacement vehicle…"
          />

          <Text style={[styles.replacementFieldLabel, { marginTop: 16 }]}>REPLACEMENT DRIVER</Text>
          <DriverSearchInput
            value={driverInputValue}
            onSelect={(driver) => {
              setReplacementDriver(driver);
              setDriverInputValue(driver.fullName);
            }}
            placeholder="Search replacement driver…"
          />

          {transshipmentError && (
            <View style={styles.actionErrorBox}>
              <AlertCircle size={16} color={theme.colors.error} />
              <Text style={styles.actionErrorText}>{transshipmentError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.actionBtnGreen,
              (!canConfirmTransshipment || transshipmentLoading) && styles.actionBtnDisabled,
            ]}
            onPress={handleConfirmTransshipment}
            disabled={!canConfirmTransshipment || transshipmentLoading}
            activeOpacity={0.8}
          >
            {transshipmentLoading
              ? <ActivityIndicator size="small" color={theme.colors.white} />
              : <Text style={styles.actionBtnText}>Confirm Transshipment</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.black,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerSpacer: {
    width: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  verifyRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  pdfSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    padding: 14,
    gap: 12,
  },
  pdfToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pdfToggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.black,
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: '#f0f4ff',
  },
  pdfButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
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
  actionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.separator,
    backgroundColor: theme.colors.background,
    gap: 10,
  },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnGreen: {
    backgroundColor: theme.colors.green,
  },
  actionBtnAmber: {
    backgroundColor: '#c2410c',
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.white,
  },
  actionErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
  },
  actionErrorText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.error,
    fontWeight: '500',
  },
  replacementContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.separator,
    backgroundColor: theme.colors.background,
    gap: 12,
  },
  replacementTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.black,
  },
  replacementSubtitle: {
    fontSize: 13,
    color: theme.colors.grey1,
    marginTop: -6,
  },
  replacementCurrentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  replacementCurrentLabel: {
    fontSize: 13,
    color: theme.colors.grey1,
  },
  replacementCurrentValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
  },
  replacementFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.grey1,
    marginBottom: 6,
  },
});
