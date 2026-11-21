// lib/orderMeta.ts
//
// The `orders` table has no dedicated columns for GST %, the manual/coupon discount
// split, or how a credit bill was finally settled. Those are kept inside the existing
// `split_details` jsonb column so no schema change is needed:
//
//   split_details = {
//     cash, gpay,                       // SPLIT payment at billing time
//     gst_percentage,                   // e.g. 5
//     manual_discount, coupon_discount, // rupee amounts
//     settle: { mode: 'CASH'|'GPAY'|'SPLIT', cash, gpay, amount, at }  // credit settlement
//   }

export type SettleMode = 'CASH' | 'GPAY' | 'SPLIT';

export interface SettlementInfo {
  mode: SettleMode;
  cash: number;
  gpay: number;
  amount: number;
  at?: string;
}

export interface OrderMeta {
  gstPercentage: number;
  manualDiscount: number | null;
  couponDiscount: number | null;
  splitCash: number;
  splitGpay: number;
  advancePaid: number;
  advanceMode: string;
  advanceCash: number;
  advanceGpay: number;
  taxMode: string;
  settle: SettlementInfo | null;
}

function parseDetails(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

const num = (v: any): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function readOrderMeta(row: any): OrderMeta {
  const d = parseDetails(row?.split_details);
  const s = d.settle && typeof d.settle === 'object' ? d.settle : null;
  return {
    gstPercentage: num(d.gst_percentage) ?? 0,
    manualDiscount: num(d.manual_discount),
    couponDiscount: num(d.coupon_discount),
    splitCash: num(d.cash) ?? num(row?.split_cash) ?? 0,
    splitGpay: num(d.gpay) ?? num(row?.split_gpay) ?? 0,
    advancePaid: num(d.advance_paid) ?? 0,
    advanceMode: String(d.advance_mode || '').toUpperCase(),
    advanceCash: num(d.advance_cash) ?? 0,
    advanceGpay: num(d.advance_gpay) ?? 0,
    taxMode: String(d.tax_mode || '').toLowerCase(),
    settle: s
      ? {
          mode: (String(s.mode || 'CASH').toUpperCase() as SettleMode),
          cash: num(s.cash) ?? 0,
          gpay: num(s.gpay) ?? 0,
          amount: num(s.amount) ?? 0,
          at: s.at,
        }
      : null,
  };
}

export function buildSplitDetails(input: {
  existing?: any;
  cash?: number;
  gpay?: number;
  gstPercentage?: number;
  manualDiscount?: number;
  couponDiscount?: number;
  advancePaid?: number;
  advanceMode?: string;
  advanceCash?: number;
  advanceGpay?: number;
  taxMode?: string;
  settle?: SettlementInfo;
}): Record<string, any> {
  const base = { ...parseDetails(input.existing) };
  if (input.cash !== undefined) base.cash = Number(input.cash) || 0;
  if (input.gpay !== undefined) base.gpay = Number(input.gpay) || 0;
  if (input.gstPercentage !== undefined) base.gst_percentage = Number(input.gstPercentage) || 0;
  if (input.manualDiscount !== undefined) base.manual_discount = Number(input.manualDiscount) || 0;
  if (input.couponDiscount !== undefined) base.coupon_discount = Number(input.couponDiscount) || 0;
  if (input.advancePaid !== undefined) base.advance_paid = Number(input.advancePaid) || 0;
  if (input.advanceMode !== undefined) base.advance_mode = String(input.advanceMode).toUpperCase();
  if (input.advanceCash !== undefined) base.advance_cash = Number(input.advanceCash) || 0;
  if (input.advanceGpay !== undefined) base.advance_gpay = Number(input.advanceGpay) || 0;
  if (input.taxMode) base.tax_mode = String(input.taxMode).toLowerCase();
  if (input.settle) base.settle = input.settle;
  return base;
}

/**
 * Fields to spread onto a mapped order so every viewer (invoice page, thermal,
 * WhatsApp, lists) sees the same split-up.
 */
export function metaToOrderFields(row: any) {
  const m = readOrderMeta(row);
  const out: Record<string, any> = {
    split_cash: m.splitCash,
    split_gpay: m.splitGpay,
    settle_mode: m.settle?.mode ?? null,
    settle_cash: m.settle?.cash ?? 0,
    settle_gpay: m.settle?.gpay ?? 0,
    settle_amount: m.settle?.amount ?? 0,
    advance_paid_earlier: m.advancePaid,
    advance_mode: m.advanceMode,
    advance_cash: m.advanceCash,
    advance_gpay: m.advanceGpay,
  };
  if (m.taxMode) {
    out.tax_mode = m.taxMode;
    out.taxMode = m.taxMode;
  }
  if (m.manualDiscount !== null || m.couponDiscount !== null) {
    out.manualDiscount = m.manualDiscount ?? 0;
    out.couponDiscount = m.couponDiscount ?? 0;
    out.manual_discount_amount = m.manualDiscount ?? 0;
    out.coupon_discount_amount = m.couponDiscount ?? 0;
  }
  return { fields: out, gstPercentage: m.gstPercentage };
}

/**
 * Best guess of the GST % for old bills that never stored it. GST is inclusive, so the
 * taxable value is total - delivery - gst, and the rate is gst / taxable. The result is
 * snapped to the common slabs (3, 5, 12, 18, 28) when it is within 0.6 of one.
 */
export function estimateGstPercent(gstAmount: number, total: number, row?: any): number {
  const gst = Number(gstAmount) || 0;
  const delivery = Number(row?.delivery_charge ?? row?.delivery_fee ?? row?.deliveryFee ?? 0) || 0;
  const taxable = (Number(total) || 0) - delivery - gst;
  if (gst <= 0 || taxable <= 0) return 0;
  const pct = (gst / taxable) * 100;
  const slab = [3, 5, 12, 18, 28].find((x) => Math.abs(x - pct) <= 0.6);
  return slab ?? Math.round(pct);
}
