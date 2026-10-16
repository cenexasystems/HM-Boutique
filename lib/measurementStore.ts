import { isSupabaseConfigured, supabase } from './supabase';
import type { MeasurementOption, MeasurementOrder, MeasurementOrderInput, MeasurementStatus, OptionKind } from './measurements';

const TABLE = 'measurement_orders';

const missingTable = (msg: string) =>
  /does not exist|schema cache|relation/i.test(msg)
    ? 'Measurements tables not found. Run supabase_measurements_migration.sql in the Supabase SQL Editor.'
    : msg;

function toOrder(r: any): MeasurementOrder {
  return {
    id: r.id,
    invoice_no: r.invoice_no || '',
    order_kind: r.order_kind === 'ADVANCE' ? 'ADVANCE' : 'INVOICE',
    customer_name: r.customer_name || '',
    phone: r.phone || '',
    address: r.address || '',
    status: (['PENDING', 'COMPLETED', 'CANCELLED'].includes(r.status) ? r.status : 'PENDING') as MeasurementStatus,
    items: Array.isArray(r.items) ? r.items : [],
    created_at: r.created_at,
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

  async list(): Promise<MeasurementOrder[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3000);
    if (error) throw new Error(missingTable(error.message));
    return (data || []).map(toOrder);
  },

  async create(input: MeasurementOrderInput): Promise<MeasurementOrder> {
    requireDb();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        invoice_no: input.invoice_no,
        order_kind: input.order_kind,
        customer_name: input.customer_name.trim() || 'Guest',
        phone: input.phone.trim(),
        address: input.address.trim(),
        items: input.items,
      })
      .select()
      .single();
    if (error) throw new Error(missingTable(error.message));
    return toOrder(data);
  },

  async setStatus(id: string, status: MeasurementStatus): Promise<void> {
    requireDb();
    const { error } = await supabase.from(TABLE).update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(missingTable(error.message));
  },

  async remove(id: string): Promise<void> {
    requireDb();
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw new Error(missingTable(error.message));
  },
};
