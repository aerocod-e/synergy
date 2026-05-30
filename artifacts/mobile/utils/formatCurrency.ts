export function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  return '₦' + naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNairaWithSign(kobo: number, entryType: 'credit' | 'reversal'): string {
  const naira = Math.abs(kobo) / 100;
  const formatted = naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return entryType === 'credit' ? '+₦' + formatted : '-₦' + formatted;
}
