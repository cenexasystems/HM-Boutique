// lib/paymentRows.ts
//
// The "how was this bill paid" lines shown on invoices, thermal receipts and the
// Order Details popup, so every screen shows the same split-up.

import { getOrderTotals } from './orderTotals';

export type PayRow = { label: string; value: string; strong?: boolean; tone?: 'good' | 'bad' };

export function buildPaymentRows(order: any): PayRow[] {
  const totals = getOrderTotals(order);
  const isCredit =
    order.payment_method === "CREDIT" ||
    order.payment_method === "credit" ||
    String(order.payment_mode || "").toUpperCase() === "CREDIT" ||
    Boolean(order.is_credit);

  const isAdvance =
    Boolean(order.is_advance) ||
    String(order.id || "").startsWith("DEP-") ||
    String(order.invoice_no || order.invoice_number || order.invoiceNo || "").startsWith("DEP-");
  // Single derived rule: CREDIT INVOICE until COMPLETED, then TAX INVOICE
  const isSettled =
    String(order.status || "").toUpperCase() === "COMPLETED" ||
    order.credit_status === "paid" ||
    totals.balance === 0;



  // ── Payment summary rows (shared by thermal + A4) ──────────────────────────
  const o: any = order;
  const money = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const methodName = (m: string) =>
    m === "GPAY" || m === "UPI" ? "GPay / UPI" : m === "CARD" ? "Card" : m === "SPLIT" ? "Split (Cash + GPay)" : m === "CASH" ? "Cash" : m;
  const fmtShort = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

  const settleMode = String(o.settle_mode || "").toUpperCase();
  const settleCash = Number(o.settle_cash) || 0;
  const settleGpay = Number(o.settle_gpay) || 0;
  const settleAmount = Number(o.settle_amount) || 0;
  const billSplitCash = Number(o.split_cash ?? o.splitCash) || 0;
  const billSplitGpay = Number(o.split_gpay ?? o.splitGpay) || 0;
  const billMode = String(
    (isAdvance ? o.deposit_payment_mode : "") || o.payment_mode || o.payment_method || "CASH"
  ).toUpperCase();
  const advMode = String(o.advance_mode || "").toUpperCase();
  const advCash = Number(o.advance_cash) || 0;
  const advGpay = Number(o.advance_gpay) || 0;

  type PayRow = { label: string; value: string; strong?: boolean; tone?: "good" | "bad" };
  const payRows: PayRow[] = [];
  const dueDateStr = fmtShort(o.credit_due_date || o.due_date);
  // "Paid Via" line plus the cash/GPay breakdown when it was a split
  const viaRows = (mode: string, cash: number, gpay: number, label = "Paid Via:"): PayRow[] => {
    const rows: PayRow[] = [{ label, value: methodName(mode || "CASH") }];
    if (mode === "SPLIT") {
      rows.push({ label: "  Cash:", value: money(cash) });
      rows.push({ label: "  GPay:", value: money(gpay) });
    }
    return rows;
  };

  if (isCredit || isAdvance) {
    const kind = isCredit ? "Credit" : "Advance";
    // Amount received before settlement (at billing for credit, deposit for advance)
    const paidEarlier = isSettled
      ? settleAmount > 0
        ? Math.max(0, Math.round((totals.grandTotal - settleAmount) * 100) / 100)
        : 0
      : totals.paid;
    payRows.push({ label: "Bill Total:", value: money(totals.grandTotal) });
    if (isSettled) {
      if (paidEarlier > 0) {
        payRows.push({ label: isCredit ? "Paid at Billing:" : "Advance Paid:", value: money(paidEarlier) });
        if (isAdvance) payRows.push(...viaRows(billMode, billSplitCash, billSplitGpay, "Advance Paid Via:"));
      }
      if (settleAmount > 0 || settleMode) {
        payRows.push({ label: `${isCredit ? "Credit" : "Balance"} Settled${o.credit_paid_at ? " (" + fmtShort(o.credit_paid_at) + ")" : ""}:`, value: money(settleAmount || totals.grandTotal - paidEarlier) });
        payRows.push(...viaRows(settleMode || "CASH", settleCash, settleGpay, "Balance Paid Via:"));
      }
      payRows.push({ label: "Total Paid:", value: money(totals.grandTotal), strong: true });
    } else {
      payRows.push({ label: isCredit ? "Paid So Far:" : "Advance Paid:", value: money(totals.paid), strong: true });
      if (isAdvance && totals.paid > 0) payRows.push(...viaRows(billMode, billSplitCash, billSplitGpay, "Advance Paid Via:"));
    }
    payRows.push({ label: "Balance Due:", value: money(totals.balance), strong: true, tone: totals.balance === 0 ? "good" : "bad" });
    if (!isSettled && dueDateStr) payRows.push({ label: "Due Date:", value: dueDateStr });
    void kind;
  } else if (Number(o.advance_paid_earlier) > 0) {
    // Final invoice of an advance order: show the earlier deposit and how the balance was paid.
    const earlier = Number(o.advance_paid_earlier) || 0;
    const nowPaid = settleAmount > 0 ? settleAmount : Math.max(0, totals.grandTotal - earlier);
    payRows.push({ label: "Bill Total:", value: money(totals.grandTotal) });
    payRows.push({ label: "Advance Paid Earlier:", value: money(earlier) });
    if (advMode) payRows.push(...viaRows(advMode, advCash, advGpay, "Advance Paid Via:"));
    payRows.push({ label: "Balance Paid Now:", value: money(nowPaid) });
    payRows.push(...viaRows(settleMode || billMode, settleCash || billSplitCash, settleGpay || billSplitGpay, "Balance Paid Via:"));
    payRows.push({ label: "Total Paid:", value: money(totals.grandTotal), strong: true });
    payRows.push({ label: "Balance Due:", value: money(0), strong: true, tone: "good" });
  } else {
    payRows.push({ label: "Paid Via:", value: methodName(billMode) });
    if (billMode === "SPLIT") {
      payRows.push({ label: "  Cash:", value: money(billSplitCash) });
      payRows.push({ label: "  GPay:", value: money(billSplitGpay) });
    }
    payRows.push({ label: "Amount Paid:", value: money(totals.grandTotal), strong: true });
    payRows.push({ label: "Balance Due:", value: money(0), strong: true, tone: "good" });
  }

  return payRows;
}
