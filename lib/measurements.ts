// Shared types + constants for the Measurements module (safe for client and server).

/** What the tailor needs for ONE billed line item (view-only; never printed on receipts). */
export type ItemMeasurement = {
  due_date: string | null; // YYYY-MM-DD
  front_neck_type: string;
  back_neck_type: string;
  sleeve_type: string;
  sleeve_length: string;
  measurements: Record<string, string>; // key from MEASUREMENT_FIELDS -> cm value
  remarks: string[];
};

/** An ItemMeasurement plus the bill line it belongs to (snapshotted when the bill is saved). */
export type MeasurementLine = ItemMeasurement & {
  item_name: string;
  price: number;
  qty: number;
};

export type MeasurementStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';
export const MEASUREMENT_STATUSES: MeasurementStatus[] = ['PENDING', 'COMPLETED', 'CANCELLED'];

/** One saved bill (invoice or advance order) and the measurements of its line items. */
export type MeasurementOrder = {
  id: string;
  invoice_no: string;
  order_kind: 'INVOICE' | 'ADVANCE';
  customer_name: string;
  phone: string;
  address: string;
  status: MeasurementStatus;
  items: MeasurementLine[];
  created_at: string;
};

export type MeasurementOrderInput = Omit<MeasurementOrder, 'id' | 'status' | 'created_at'>;

export const MEASUREMENT_FIELDS: { key: string; label: string }[] = [
  { key: 'front_neck', label: 'Front Neck' },
  { key: 'back_neck', label: 'Back Neck' },
  { key: 'shoulder', label: 'Shoulder' },
  { key: 'sleeve_length', label: 'Sleeve Length' },
  { key: 'arm_hole_curve', label: 'Arm Hole Curve' },
  { key: 'shoulder_to_waist', label: 'Shoulder to Waist' },
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'blouse_length', label: 'Blouse Length' },
  { key: 'side_cut', label: 'Side Cut' },
  { key: 'front_cut', label: 'Front Cut' },
  { key: 'back_cut', label: 'Back Cut' },
];

export const SLEEVE_TYPES = ['Sleeveless', 'Short', '3/4', 'Full', 'Puff', 'Bell', 'Custom'];
export const SLEEVE_LENGTHS = ['Short', 'Elbow', '3/4', 'Full'];

export const NECK_TYPES = [
  'V Neck',
  'Round',
  'Square',
  'Boat',
  'Sweetheart',
  'Queen',
  'Pentagon',
  'Keyhole',
  'Teardrop',
  'Collar',
  'Round With Cut',
] as const;

export type OptionKind = 'neck' | 'sleeve_type' | 'sleeve_length';

export type MeasurementOption = { id: string; kind: OptionKind; name: string };

export const OPTION_KINDS: { kind: OptionKind; title: string; builtIn: readonly string[] }[] = [
  { kind: 'neck', title: 'Neck Types', builtIn: NECK_TYPES },
  { kind: 'sleeve_type', title: 'Sleeve Types', builtIn: SLEEVE_TYPES },
  { kind: 'sleeve_length', title: 'Sleeve Lengths', builtIn: SLEEVE_LENGTHS },
];

export type MeasurementPeriod = 'all' | 'today' | 'week' | 'month' | 'year';

/** Local-time YYYY-MM-DD (never toISOString, which shifts the day in IST). */
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Date range (inclusive, YYYY-MM-DD) a period button stands for. Week runs Monday-Sunday.
 * "all" has no bounds (empty strings).
 */
export function periodRange(period: MeasurementPeriod, now = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return { from: toYmd(today), to: toYmd(today) };
  if (period === 'week') {
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: toYmd(mon), to: toYmd(sun) };
  }
  if (period === 'month') {
    return {
      from: toYmd(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: toYmd(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  if (period === 'year') {
    return { from: toYmd(new Date(today.getFullYear(), 0, 1)), to: toYmd(new Date(today.getFullYear(), 11, 31)) };
  }
  return { from: '', to: '' };
}

export function emptyItemMeasurement(): ItemMeasurement {
  return {
    due_date: null,
    front_neck_type: '',
    back_neck_type: '',
    sleeve_type: '',
    sleeve_length: '',
    measurements: {},
    remarks: [],
  };
}

/** True when the tailor entered anything worth saving. */
export function hasMeasurementData(m: ItemMeasurement): boolean {
  return Boolean(
    m.front_neck_type ||
      m.back_neck_type ||
      m.sleeve_type ||
      m.sleeve_length ||
      m.due_date ||
      m.remarks.some((r) => r.trim()) ||
      Object.values(m.measurements).some((v) => String(v).trim()),
  );
}

/**
 * Measurement server actions return this instead of throwing: Next.js hides thrown server
 * errors in production ("Minified React error #441"), which would hide the real reason.
 */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export function unwrap<T>(r: ActionResult<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}
