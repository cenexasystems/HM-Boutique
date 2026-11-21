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
      if (isAdvance) {
        const depM = billMode;
        const dC = depM === "SPLIT" ? billSplitCash : depM === "GPAY" || depM === "UPI" ? 0 : paidEarlier;
        const dG = depM === "SPLIT" ? billSplitGpay : depM === "GPAY" || depM === "UPI" ? paidEarlier : 0;
        const allC = dC + settleCash;
        const allG = dG + settleGpay;
        if (allC > 0 && allG > 0) {
          payRows.push({ label: "  Received in Cash:", value: money(allC) });
          payRows.push({ label: "  Received by GPay:", value: money(allG) });
        }
      }
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
    {
      const dC = advMode === "SPLIT" ? advCash : advMode === "GPAY" || advMode === "UPI" ? 0 : earlier;
      const dG = advMode === "SPLIT" ? advGpay : advMode === "GPAY" || advMode === "UPI" ? earlier : 0;
      const bm = settleMode || billMode;
      const bC = bm === "SPLIT" ? settleCash || billSplitCash : bm === "GPAY" || bm === "UPI" ? 0 : nowPaid;
      const bG = bm === "SPLIT" ? settleGpay || billSplitGpay : bm === "GPAY" || bm === "UPI" ? nowPaid : 0;
      if (dC + bC > 0 && dG + bG > 0) {
        payRows.push({ label: "  Received in Cash:", value: money(dC + bC) });
        payRows.push({ label: "  Received by GPay:", value: money(dG + bG) });
      }
    }
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

// ---------------------------------------------------------------------------------------------
// Combined payment mode of a bill (header / footer / badges).
//   normal bill          -> CASH | GPAY | SPLIT | CARD
//   credit, unpaid       -> CREDIT
//   credit, settled      -> CREDIT · PAID BY SPLIT (cash / gpay / split used at settlement)
//   advance (open)       -> how the deposit was paid
//   advance / its final invoice, paid in stages -> "<deposit mode> + <balance mode>", e.g. SPLIT + CASH
// ---------------------------------------------------------------------------------------------
const up = (v: any) => String(v ?? '').toUpperCase();

function ctxOf(order: any) {
  const totals = getOrderTotals(order);
  const isCredit =
    up(order?.payment_method) === 'CREDIT' || up(order?.payment_mode) === 'CREDIT' || Boolean(order?.is_credit);
  const isAdvance =
    Boolean(order?.is_advance) ||
    String(order?.id || '').startsWith('DEP-') ||
    String(order?.invoice_no || order?.invoice_number || order?.invoiceNo || '').startsWith('DEP-');
  const isSettled =
    up(order?.status) === 'COMPLETED' || order?.credit_status === 'paid' || totals.balance === 0;
  const settleMode = up(order?.settle_mode);
  const baseMode = up((isAdvance ? order?.deposit_payment_mode : '') || order?.payment_mode || order?.payment_method || 'CASH');
  const advMode = up(order?.advance_mode);
  const hadAdvance = Number(order?.advance_paid_earlier) > 0;
  return { totals, isCredit, isAdvance, isSettled, settleMode, baseMode, advMode, hadAdvance };
}

export function paymentModeLabel(order: any): string {
  if (!order) return 'CASH';
  const c = ctxOf(order);
  if (c.isCredit) return c.isSettled && c.settleMode ? `CREDIT · PAID BY ${c.settleMode}` : 'CREDIT';
  if (c.hadAdvance) {
    const dep = c.advMode || c.baseMode;
    const bal = c.settleMode || c.baseMode;
    return dep && bal && dep !== bal ? `${dep} + ${bal}` : dep || bal;
  }
  if (c.isAdvance) {
    if (c.isSettled && c.settleMode && c.settleMode !== c.baseMode) return `${c.baseMode} + ${c.settleMode}`;
    return c.baseMode;
  }
  return c.baseMode;
}

/** Short lines for list cards: how the deposit and (when paid) the balance were paid. */
export function advancePaymentSummary(order: any): string[] {
  if (!order) return [];
  const c = ctxOf(order);
  const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const name = (m: string) => (m === 'GPAY' || m === 'UPI' ? 'GPay' : m === 'SPLIT' ? 'Split' : m === 'CARD' ? 'Card' : 'Cash');
  const lines: string[] = [];

  const depMode = c.hadAdvance ? c.advMode || c.baseMode : c.baseMode;
  const depCash = c.hadAdvance ? Number(order.advance_cash) || 0 : Number(order.split_cash ?? order.splitCash) || 0;
  const depGpay = c.hadAdvance ? Number(order.advance_gpay) || 0 : Number(order.split_gpay ?? order.splitGpay) || 0;
  const depPaid = c.hadAdvance ? Number(order.advance_paid_earlier) || 0 : c.totals.paid;
  if (c.isAdvance || c.hadAdvance) {
    if (!c.isSettled || c.hadAdvance || c.settleMode) {
      let t = `Deposit ${money(c.isSettled && !c.hadAdvance && c.settleMode ? c.totals.grandTotal - (Number(order.settle_amount) || 0) : depPaid)} via ${name(depMode)}`;
      if (depMode === 'SPLIT') t += ` (Cash ${money(depCash)} + GPay ${money(depGpay)})`;
      lines.push(t);
    }
    const sm = c.settleMode;
    if (sm) {
      let t = `Balance ${money(Number(order.settle_amount) || 0)} via ${name(sm)}`;
      if (sm === 'SPLIT') t += ` (Cash ${money(Number(order.settle_cash) || 0)} + GPay ${money(Number(order.settle_gpay) || 0)})`;
      lines.push(t);
    }
  }
  return lines;
}
