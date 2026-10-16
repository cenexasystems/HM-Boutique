import { isSupabaseConfigured, supabase } from './supabase';
import { OPTION_KINDS } from './measurements';
import type { MeasurementOption, MeasurementOrder, MeasurementOrderInput, MeasurementStatus, OptionKind } from './measurements';

const TABLE = 'measurement_orders';
const OPTIONS_TABLE = 'measurement_options';
// Hidden row that records the built-in options were copied into the table (so deleting them sticks).
const SEED_MARKER = '__seeded__';

const missingTable = (msg: string) =>
  /does not exist|schema cache|relation/i.test(msg)
    ? 'Measurements tables not found or outdated. Run supabase_measurements_migration.sql in the Supabase SQL Editor.'
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

const dupMessage = (msg: string, name: string) =>
  /duplicate|unique/i.test(msg) ? `"${name}" already exists` : missingTable(msg);

export const measurementStore = {
  /** All options, built-ins included. The first call copies the built-in defaults into the table. */
  async listOptions(): Promise<MeasurementOption[]> {
    if (!isSupabaseConfigured) return [];
    const read = () =>
      supabase
        .from(OPTIONS_TABLE)
        .select('id, kind, name')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    let { data, error } = await read();
    if (error) throw new Error(missingTable(error.message));

    if (!(data || []).some((r: any) => r.name === SEED_MARKER)) {
      const rows = OPTION_KINDS.flatMap(({ kind, builtIn }) => builtIn.map((name, i) => ({ kind, name, sort_order: i + 1 })));
      rows.push({ kind: 'neck', name: SEED_MARKER, sort_order: -1 });
      const { error: seedErr } = await supabase.from(OPTIONS_TABLE).upsert(rows, { onConflict: 'kind,name', ignoreDuplicates: true });
      if (seedErr) throw new Error(missingTable(seedErr.message));
      ({ data, error } = await read());
      if (error) throw new Error(missingTable(error.message));
    }
    return (data || []).filter((r: any) => r.name !== SEED_MARKER) as MeasurementOption[];
  },

  async addOption(kind: OptionKind, name: string): Promise<MeasurementOption> {
    requireDb();
    const clean = name.trim();
    if (!clean || clean.startsWith('__')) throw new Error('Enter a valid name');
    const { data: last } = await supabase
      .from(OPTIONS_TABLE)
      .select('sort_order')
      .eq('kind', kind)
      .order('sort_order', { ascending: false })
      .limit(1);
    const next = Number(last?.[0]?.sort_order ?? 0) + 1;
    const { data, error } = await supabase
      .from(OPTIONS_TABLE)
      .insert({ kind, name: clean, sort_order: next })
      .select('id, kind, name')
      .single();
    if (error) throw new Error(dupMessage(error.message, clean));
    return data as MeasurementOption;
  },

  async renameOption(id: string, name: string): Promise<MeasurementOption> {
    requireDb();
    const clean = name.trim();
    if (!clean || clean.startsWith('__')) throw new Error('Enter a valid name');
    const { data, error } = await supabase.from(OPTIONS_TABLE).update({ name: clean }).eq('id', id).select('id, kind, name').single();
    if (error) throw new Error(dupMessage(error.message, clean));
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
