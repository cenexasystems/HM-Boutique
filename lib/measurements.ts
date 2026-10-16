// Shared types + constants for the Measurements module (safe for client and server).

export type MeasurementRecord = {
  id: string;
  measurement_no: string;
  customer_name: string;
  phone: string;
  address: string;
  item_name: string;
  price: number;
  due_date: string | null; // YYYY-MM-DD
  front_neck_type: string;
  back_neck_type: string;
  sleeve_type: string;
  sleeve_length: string;
  measurements: Record<string, string>; // key from MEASUREMENT_FIELDS -> cm value
  remarks: string[];
  created_at: string;
};

export type MeasurementInput = Omit<MeasurementRecord, 'id' | 'measurement_no' | 'created_at'>;

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

export type MeasurementPeriod = 'today' | 'week' | 'month' | 'all';

/** Start of the period in local time (week starts Monday). `null` = no lower bound. */
export function periodStart(period: MeasurementPeriod, now = new Date()): Date | null {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return d;
  if (period === 'week') {
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    return d;
  }
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

export function emptyMeasurement(seed?: Partial<MeasurementInput>): MeasurementInput {
  return {
    customer_name: '',
    phone: '',
    address: '',
    item_name: '',
    price: 0,
    due_date: null,
    front_neck_type: '',
    back_neck_type: '',
    sleeve_type: '',
    sleeve_length: '',
    measurements: {},
    remarks: [],
    ...seed,
  };
}
