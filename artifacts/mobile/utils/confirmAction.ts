import { Alert, Platform } from 'react-native';

export interface ConfirmActionOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Shows a Yes/No confirmation dialog.
 * On native, uses Alert.alert. On web (where Alert.alert is a no-op),
 * falls back to window.confirm so the dialog actually appears.
 */
export function confirmAction({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmActionOptions): void {
  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed) {
      onConfirm();
    } else if (onCancel) {
      onCancel();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel', onPress: onCancel },
    {
      text: confirmText,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}

/**
 * Shows a single-button notice/error dialog.
 * On native, uses Alert.alert. On web, falls back to window.alert.
 */
export function notifyAction(title: string, message: string): void {
  if (Platform.OS === 'web') {
    window.alert(title ? `${title}\n\n${message}` : message);
    return;
  }

  Alert.alert(title, message);
}
