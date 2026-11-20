// lib/paymentSplit.ts
//
// Analytics helpers: where did the money come from (Cash / GPay / Card), how much
// is still owed on credit bills, and how much is held as advance deposits.
//
// Rules
//  - A completed bill's amount is divided between payment modes. A split bill puts
//    its cash part in Cash and its GPay part in GPay.
//  - A credit bill only counts as money received once it is PAID; then the amount
//    goes to Cash / GPay according to how the balance was settled.
//  - An advance order's deposit counts as money received (by the deposit's mode /
//    split) while the order is pending; the unpaid balance is shown as pending.
//    When the advance is completed, its final invoice carries the full total.

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
const r2 = (x: number) => Math.round(x * 100) / 100;
const up = (v: any) => String(v ?? '').toUpperCase();

export const orderTotal = (o: any): number =>
  n(o?.grand_total ?? o?.grandTotal ?? o?.total ?? o?.total_amount);

export const orderKey = (o: any): string =>
  String(o?.invoice_no ?? o?.invoiceNo ?? o?.id ?? '');

export function isAdvanceRow(o: any): boolean {
  return (
    o?.is_advance === true ||
    up(o?.order_type) === 'ADVANCE' ||
    orderKey(o).toUpperCase().startsWith('DEP-')
  );
}

export function isCreditRow(o: any): boolean {
  return Boolean(
    o?.is_credit ||
      up(o?.payment_mode ?? o?.paymentMode) === 'CREDIT' ||
      up(o?.payment_method) === 'CREDIT' ||
      o?.credit_status,
  );
}

export function isCompletedRow(o: any): boolean {
  return up(o?.status) === 'COMPLETED' || String(o?.credit_status || '').toLowerCase() === 'paid';
}

/**
 * Completing an advance creates a second (final invoice) row that references the
 * advance. Drop the completed advance row so the sale is not counted twice.
 */
export function dedupeAdvance<T = any>(list: T[], all: any[] = list as any[]): T[] {
  // A completed advance keeps the same number but changes prefix (DEP-123 -> INV-123),
  // so compare on the number without its DEP-/INV- prefix.
  const stem = (k: string) => k.replace(/^(DEP|INV)-/i, '').toUpperCase();
  const referenced = new Set<string>();
  for (const o of all) {
    const ref = String((o as any)?.reference_number ?? '');
    if (ref) referenced.add(stem(ref));
  }
  return list.filter((o: any) => {
    if (!isAdvanceRow(o) || !isCompletedRow(o)) return true;
    return !referenced.has(stem(orderKey(o)));
  });
}

/**
 * Divide an amount between payment modes. `amount` defaults to the bill total; pass
 * the deposit for a pending advance. Works on raw DB rows and mapped orders.
 */
export function allocatePayment(order: any, amount?: number): PaymentParts {
  const total = amount !== undefined ? amount : orderTotal(order);
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
    const rest = r2(total - known);
    const mode = up(
      order?.deposit_payment_mode || order?.payment_mode || order?.payment_method || order?.paymentMode || 'CASH',
    );
    if (mode === 'GPAY' || mode === 'UPI') gpay += rest;
    else if (mode === 'CARD') card += rest;
    else cash += rest; // CASH, and legacy rows with no split information
  } else if (known > total + 0.009 && total > 0) {
    // never report more than was actually paid
    const f = total / known;
    cash *= f;
    gpay *= f;
  }

  return { cash: r2(cash), gpay: r2(gpay), card: r2(card) };
}

export interface CashflowSummary {
  cash: number;
  gpay: number;
  card: number;
  cashBills: number;
  gpayBills: number;
  cardBills: number;
  /** bills paid by a mix of cash + gpay */
  splitBills: number;
  splitAmount: number;
  splitCash: number;
  splitGpay: number;
  credit: { outstanding: number; outstandingBills: number; collected: number; collectedBills: number };
  advance: { pending: number; pendingBills: number; deposits: number; depositBills: number };
}

/**
 * `orders` = every order in scope (any status). Cancelled rows are ignored.
 */
export function summarizeCashflow(orders: any[]): CashflowSummary {
  const t: CashflowSummary = {
    cash: 0, gpay: 0, card: 0, cashBills: 0, gpayBills: 0, cardBills: 0,
    splitBills: 0, splitAmount: 0, splitCash: 0, splitGpay: 0,
    credit: { outstanding: 0, outstandingBills: 0, collected: 0, collectedBills: 0 },
    advance: { pending: 0, pendingBills: 0, deposits: 0, depositBills: 0 },
  };

  const add = (p: PaymentParts) => {
    t.cash += p.cash;
    t.gpay += p.gpay;
    t.card += p.card;
    if (p.cash > 0) t.cashBills++;
    if (p.gpay > 0) t.gpayBills++;
    if (p.card > 0) t.cardBills++;
    if (p.cash > 0 && p.gpay > 0) {
      t.splitBills++;
      t.splitAmount += p.cash + p.gpay;
      t.splitCash += p.cash;
      t.splitGpay += p.gpay;
    }
  };

  for (const o of orders) {
    if (up(o?.status) === 'CANCELLED' || up(o?.status) === 'CANCELED') continue;
    const total = orderTotal(o);
    const completed = isCompletedRow(o);

    if (isAdvanceRow(o) && !completed) {
      // pending advance: the deposit is money received, the rest is still owed
      const paid = Math.min(total, n(o?.amount_paid ?? o?.deposit_amount ?? o?.cash_received));
      if (paid > 0) {
        add(allocatePayment(o, paid));
        t.advance.deposits += paid;
        t.advance.depositBills++;
      }
      const bal = r2(Math.max(0, total - paid));
      if (bal > 0) {
        t.advance.pending += bal;
        t.advance.pendingBills++;
      }
      continue;
    }

    if (isCreditRow(o) && !completed) {
      // unpaid credit: nothing received yet
      const paid = n(o?.amount_paid);
      const bal = r2(Math.max(0, total - paid));
      if (bal > 0) {
        t.credit.outstanding += bal;
        t.credit.outstandingBills++;
      }
      continue;
    }

    if (completed) {
      if (isCreditRow(o)) {
        t.credit.collected += total;
        t.credit.collectedBills++;
      }
      add(allocatePayment(o));
    }
  }

  for (const k of ['cash', 'gpay', 'card', 'splitAmount', 'splitCash', 'splitGpay'] as const) t[k] = r2(t[k]);
  t.credit.outstanding = r2(t.credit.outstanding);
  t.credit.collected = r2(t.credit.collected);
  t.advance.pending = r2(t.advance.pending);
  t.advance.deposits = r2(t.advance.deposits);
  return t;
}

/** Backwards-compatible: payment totals of completed bills only. */
export function sumPayments(orders: any[]) {
  const s = summarizeCashflow(orders.filter((o) => isCompletedRow(o)));
  return { ...s };
}
