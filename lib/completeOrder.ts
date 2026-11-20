import { isUuid } from './ids';
import { STATUS } from './orderStatus';
import { getOrderTotals } from './orderTotals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSplitDetails, type SettleMode } from './orderMeta';

export interface SettlementPayment {
  mode: SettleMode;
  cash?: number;
  gpay?: number;
}

export async function completeOrder(
  supabase: SupabaseClient,
  row: { id?: string; invoice_no?: string; invoiceNo?: string; total?: number; grand_total?: number; grandTotal?: number; [key: string]: any },
  payment?: SettlementPayment
) {
  let targetId = row?.id;
  const invoiceNo = row?.invoice_no || row?.invoiceNo;
  let fullRow = { ...row };

  if (!targetId || !isUuid(targetId)) {
    const lookupVal = targetId || invoiceNo;
    if (lookupVal) {
      const cleanVal = String(lookupVal).trim();
      const { data: found } = await supabase
        .from('orders')
        .select('*')
        .or(isUuid(cleanVal) ? `id.eq.${cleanVal},invoice_no.eq.${cleanVal}` : `invoice_no.eq.${cleanVal}`)
        .limit(1)
        .maybeSingle();

      if (found?.id) {
        targetId = found.id;
        fullRow = { ...found, ...row };
      }
    }
  }

  if (!targetId || !isUuid(targetId)) {
    throw new Error(`Row has no valid UUID and could not be resolved from invoice_no: received "${row?.id}"`);
  }

  const totals = getOrderTotals(fullRow);
  const orderTotal = totals.grandTotal;

  // How the outstanding balance was paid at settlement (defaults to cash).
  const balanceNow = totals.balance > 0 ? totals.balance : 0;
  const mode = payment?.mode || 'CASH';
  const settleCash = mode === 'CASH' ? balanceNow : mode === 'SPLIT' ? Number(payment?.cash) || 0 : 0;
  const settleGpay = mode === 'GPAY' ? balanceNow : mode === 'SPLIT' ? Number(payment?.gpay) || 0 : 0;
  if (mode === 'SPLIT' && Math.abs(settleCash + settleGpay - balanceNow) > 0.009) {
    throw new Error('Split amounts must add up to the balance due');
  }
  const nowIso = new Date().toISOString();
  const splitDetails = buildSplitDetails({
    existing: fullRow.split_details,
    settle: { mode, cash: settleCash, gpay: settleGpay, amount: balanceNow, at: nowIso },
  });

  let officialInvoiceNo = fullRow.invoice_no || fullRow.invoiceNo || invoiceNo;
  if (officialInvoiceNo && String(officialInvoiceNo).toUpperCase().startsWith('DEP-')) {
    officialInvoiceNo = String(officialInvoiceNo).replace(/^DEP-/i, 'INV-');
  } else if (!officialInvoiceNo || !String(officialInvoiceNo).toUpperCase().startsWith('INV-')) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    officialInvoiceNo = `INV-${ymd}-${rand}`;
  }

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: STATUS.COMPLETED,
      invoice_no: officialInvoiceNo,
      credit_status: 'paid',
      balance_due: 0,
      amount_paid: orderTotal,
      cash_received: orderTotal,
      credit_paid_at: nowIso,
      split_details: splitDetails,
      updated_at: nowIso,
    })
    .eq('id', targetId)
    .select()
    .maybeSingle();

  // Best effort sync with advance_orders table if matching
  const cleanId = String(invoiceNo || targetId).trim();
  if (cleanId) {
    try {
      await supabase
        .from('advance_orders')
        .update({
          status: 'completed',
          deposit_amount: orderTotal,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .or(isUuid(cleanId) ? `id.eq.${cleanId},deposit_id.eq.${cleanId}` : `deposit_id.eq.${cleanId}`);
    } catch {
      // non-fatal
    }
  }

  if (error || !data) {
    throw new Error(error?.message ?? 'Update affected 0 rows (check RLS UPDATE policy)');
  }

  const { data: check, error: checkErr } = await supabase
    .from('orders')
    .select('status, balance_due')
    .eq('id', targetId)
    .single();

  if (checkErr || check?.status !== STATUS.COMPLETED) {
    throw new Error('Status was reverted by a trigger or second writer');
  }

  return data;
}
