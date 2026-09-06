/** Format integer pence as pounds, e.g. 1250 -> "£12.50". */
export function formatPence(pence: number, opts: { free?: string } = {}): string {
  if (pence === 0 && opts.free !== undefined) return opts.free;
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const pennies = abs % 100;
  return `${sign}£${pounds.toLocaleString('en-GB')}.${pennies.toString().padStart(2, '0')}`;
}

/** Parse a user-typed pounds string ("12", "12.5", "£12.50") into integer pence. */
export function parsePoundsToPence(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole = '0', frac = ''] = cleaned.split('.');
  return parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
}

/** Format centimetres for display, e.g. 78.5 -> "78.5 cm". */
export function formatCm(cm: number | null | undefined, fallback = '—'): string {
  if (cm === null || cm === undefined || Number.isNaN(cm)) return fallback;
  const rounded = Math.round(cm * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} cm`;
}

/** Parse a typed centimetre string. Accepts "78", "78.5", "78,5". */
export function parseCm(input: string): number | null {
  const cleaned = input.trim().replace(',', '.');
  if (cleaned === '') return null;
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatPercent(score: number): string {
  return `${Math.round(score)}%`;
}

/** Fit confidence 0..1 -> human phrase using fields_used when available. */
export function describeConfidence(confidence: number, fieldsUsed?: string[], totalFields?: number): string {
  if (fieldsUsed && totalFields && totalFields > 0) {
    return `based on ${fieldsUsed.length} of ${totalFields} measurements`;
  }
  if (confidence >= 0.85) return 'high confidence';
  if (confidence >= 0.6) return 'good confidence';
  if (confidence >= 0.35) return 'rough estimate';
  return 'low confidence';
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Human labels for measurement field names shared by body and listing forms. */
export const FIELD_LABELS: Record<string, string> = {
  height_cm: 'Height',
  usual_size: 'Usual size',
  outseam_cm: 'Outseam',
  inseam_cm: 'Inseam',
  rise_cm: 'Rise',
  waist_cm: 'Waist',
  waist_flat_cm: 'Waist (flat)',
  hip_cm: 'Hip',
  hip_flat_cm: 'Hip (flat)',
  shoulder_cm: 'Shoulder',
  shoulder_flat_cm: 'Shoulder (flat)',
  torso_length_cm: 'Torso length',
  bust_cm: 'Bust / chest',
  pit_to_pit_cm: 'Pit to pit',
  length_cm: 'Length',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_cm$/, '').replace(/_/g, ' ');
}

export const CATEGORY_LABELS = { bottoms: 'Bottoms', tops: 'Tops', dresses: 'Dresses' } as const;

export const ISSUE_LABELS: Record<string, string> = {
  too_short: 'Too short',
  too_long: 'Too long',
  waist_tight: 'Waist tight',
  waist_loose: 'Waist loose',
  hip_tight: 'Hip tight',
  hip_loose: 'Hip loose',
  shoulders_tight: 'Shoulders tight',
  shoulders_loose: 'Shoulders loose',
  chest_tight: 'Chest tight',
  chest_loose: 'Chest loose',
  other: 'Something else',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid, awaiting dispatch',
  shipped: 'On its way',
  delivered: 'Delivered',
  released: 'Complete',
  refunded: 'Refunded',
};
