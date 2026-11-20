// lib/paymentSplit.ts
//
// Divides a completed bill's amount between payment modes so analytics can show
// Cash / GPay / Card boxes. A split bill puts its cash part in Cash and its GPay
// part in GPay; a settled credit bill / completed advance uses the settlement
// (+ earlier deposit) split. The three parts always add up to the bill total.

import { readOrderMeta } from './orderMeta';

export interface PaymentParts {
  cash: number;
  gpay: number;
  card: number;
}

const n = (v: any): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Works on raw DB rows (split_details jsonb) and on already-mapped orders. */
export function allocatePayment(order: any): PaymentParts {
  const total = n(order?.grand_total ?? order?.grandTotal ?? order?.total ?? order?.total_amount);
  const meta = readOrderMeta(order);

  const sc = n(order?.splitCash ?? order?.split_cash) || meta.splitCash;
  const sg = n(order?.splitGpay ?? order?.split_gpay) || meta.splitGpay;
  const stc = n(order?.settle_cash) || meta.settle?.cash || 0;
  const stg = n(order?.settle_gpay) || meta.settle?.gpay || 0;
  const advCash = n(order?.advance_cash) || meta.advanceCash;
  const advGpay = n(order?.advance_gpay) || meta.advanceGpay;

  let cash = 0;
  let gpay = 0;
  let card = 0;

  if (sc + sg > 0) {
    cash = sc;
    gpay = sg;
  } else if (stc + stg > 0) {
    cash = stc + advCash;
    gpay = stg + advGpay;
  }

  const known = cash + gpay;
  if (known < total - 0.009) {
    const rest = Math.round((total - known) * 100) / 100;
    const mode = String(order?.payment_mode || order?.payment_method || order?.paymentMode || 'CASH').toUpperCase();
    if (mode === 'GPAY' || mode === 'UPI') gpay += rest;
    else if (mode === 'CARD') card += rest;
    else cash += rest; // CASH, and legacy credit/advance rows with no split info
  }

  const r = (x: number) => Math.round(x * 100) / 100;
  return { cash: r(cash), gpay: r(gpay), card: r(card) };
}

export function sumPayments(orders: any[]) {
  const t = { cash: 0, gpay: 0, card: 0, cashBills: 0, gpayBills: 0, cardBills: 0, splitBills: 0 };
  for (const o of orders) {
    const p = allocatePayment(o);
    t.cash += p.cash;
    t.gpay += p.gpay;
    t.card += p.card;
    if (p.cash > 0) t.cashBills++;
    if (p.gpay > 0) t.gpayBills++;
    if (p.card > 0) t.cardBills++;
    if (p.cash > 0 && p.gpay > 0) t.splitBills++;
  }
  return t;
}
