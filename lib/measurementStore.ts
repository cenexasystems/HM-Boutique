import { isSupabaseConfigured, supabase } from './supabase';
import type { MeasurementInput, MeasurementOption, MeasurementRecord, OptionKind } from './measurements';

const TABLE = 'measurements';

const missingTable = (msg: string) =>
  /does not exist|schema cache|relation/i.test(msg)
    ? 'Measurements table not found. Run supabase_measurements_migration.sql in the Supabase SQL Editor.'
    : msg;

function genNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `MS-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function toRecord(r: Record<string, unknown>): MeasurementRecord {
  const text = (value: unknown) => typeof value === 'string' ? value : '';
  const measurementValues = r.measurements;
  return {
    id: text(r.id),
    measurement_no: text(r.measurement_no),
    customer_name: text(r.customer_name),
    phone: text(r.phone),
    address: text(r.address),
    item_name: text(r.item_name),
    price: Number(r.price) || 0,
    due_date: text(r.due_date) || null,
    front_neck_type: text(r.front_neck_type),
    back_neck_type: text(r.back_neck_type),
    sleeve_type: text(r.sleeve_type),
    sleeve_length: text(r.sleeve_length),
    measurements: measurementValues && typeof measurementValues === 'object' && !Array.isArray(measurementValues)
      ? measurementValues as Record<string, string>
      : {},
    remarks: Array.isArray(r.remarks) ? r.remarks.map(String) : [],
    created_at: text(r.created_at),
  };
}

function toRow(input: MeasurementInput) {
  return {
    customer_name: input.customer_name.trim() || 'Walk-in Customer',
    phone: input.phone.trim(),
    address: input.address.trim(),
    item_name: input.item_name.trim(),
    price: Number(input.price) || 0,
    due_date: input.due_date || null,
    front_neck_type: input.front_neck_type,
    back_neck_type: input.back_neck_type,
    sleeve_type: input.sleeve_type,
    sleeve_length: input.sleeve_length,
    measurements: input.measurements,
    remarks: input.remarks.map((r) => r.trim()).filter(Boolean),
  };
}

function requireDb() {
  if (!isSupabaseConfigured) throw new Error('Database not configured');
}

const OPTIONS_TABLE = 'measurement_options';

export const measurementStore = {
  async listOptions(): Promise<MeasurementOption[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.from(OPTIONS_TABLE).select('id, kind, name').order('created_at', { ascending: true });
    if (error) throw new Error(missingTable(error.message));
    return (data || []) as MeasurementOption[];
  },

  async addOption(kind: OptionKind, name: string): Promise<MeasurementOption> {
    requireDb();
    const clean = name.trim();
    if (!clean) throw new Error('Enter a name');
    const { data, error } = await supabase.from(OPTIONS_TABLE).insert({ kind, name: clean }).select('id, kind, name').single();
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? `"${clean}" already exists` : missingTable(error.message));
    return data as MeasurementOption;
  },

  async removeOption(id: string): Promise<void> {
    requireDb();
    const { error } = await supabase.from(OPTIONS_TABLE).delete().eq('id', id);
    if (error) throw new Error(missingTable(error.message));
  },

  async list(): Promise<MeasurementRecord[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(missingTable(error.message));
    return (data || []).map(toRecord);
  },

  async create(input: MeasurementInput): Promise<MeasurementRecord> {
    requireDb();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ ...toRow(input), measurement_no: genNo() })
      .select()
      .single();
    if (error) throw new Error(missingTable(error.message));
    return toRecord(data);
  },

  async update(id: string, input: MeasurementInput): Promise<MeasurementRecord> {
    requireDb();
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...toRow(input), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(missingTable(error.message));
    return toRecord(data);
  },

  async remove(id: string): Promise<void> {
    requireDb();
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw new Error(missingTable(error.message));
  },
};
