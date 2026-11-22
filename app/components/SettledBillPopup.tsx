"use client";

import React from "react";
import { X, Printer, Eye, Plus } from "lucide-react";
import { getOrderTotals } from "@/lib/orderTotals";
import { buildPaymentRows, paymentModeLabel } from "@/lib/paymentRows";
import { waLink } from "@/lib/normalizeOrder";
import { BRAND_EN } from "@/lib/brand";

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  order: any | null; // the credit bill after it was marked paid (normalized, with items)
  onClose: () => void;
  onView?: (order: any) => void;
  onPrint?: (order: any) => void;
}

/** "Bill Generated" popup shown right after a credit bill is marked as paid. */
export default function SettledBillPopup({ order, onClose, onView, onPrint }: Props) {
  if (!order) return null;
  const bt = getOrderTotals(order);
  const invoiceNo = order.invoiceNo || order.invoice_no || order.id;
  const isGst = bt.gstAmount > 0;
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const rows = buildPaymentRows(order);
  const label = paymentModeLabel(order);

  const row = (l: string, v: string, cls = "") => (
    <div key={l} className="flex justify-between items-center text-xs">
      <span className="font-semibold text-gray-600">{l}</span>
      <span className={`font-bold text-black ${cls}`}>{v}</span>
    </div>
  );

  const sendWhatsApp = () => {
    const phone = order.customerPhone || order.customer_phone || order.phone || "";
    const msg = `Hello ${order.customerName || order.customer_name || ""},\nThank you! Your credit payment of ${money(bt.grandTotal)} for invoice #${invoiceNo} has been received.\n- ${BRAND_EN}`;
    const link = waLink(phone, msg);
    if (link) window.open(link, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex flex-col gap-4 w-full max-w-[640px] min-w-0 bg-white rounded-2xl shadow-2xl p-4 sm:p-5 max-h-[94vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-black/10">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight">Bill Generated</h1>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${isGst ? "bg-[#F500A0]/10 text-[#F500A0]" : "bg-black/5 text-[#111827]"}`}>
                {isGst ? "GST" : "Non-GST"}
              </span>
            </div>
            <p className="text-[11px] font-mono font-bold text-[#F500A0] mt-0.5">#{invoiceNo}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-black hover:bg-gray-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-5 border border-black/10 shadow-xs space-y-3">
          <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2 flex justify-between items-center">
            <span>Payment Receipt</span>
            <span className="text-[9px] font-black text-[#F500A0] bg-black/5 px-2 py-0.5 rounded">{label}</span>
          </div>

          <div className="space-y-1.5 pb-2 border-b border-dashed border-gray-200">
            {row("Subtotal", money(bt.subtotal))}
            {bt.manualDiscount > 0 &&
              row(`Manual Discount${bt.discountType === "PERCENT" && bt.discountValue > 0 ? ` (${bt.discountValue}%)` : ""}`, `-${money(bt.manualDiscount)}`, "text-[#F500A0]")}
            {bt.couponDiscount > 0 &&
              row(`Coupon${order.coupon_code ? ` (${order.coupon_code})` : ""}`, `-${money(bt.couponDiscount)}`, "text-[#F500A0]")}
            {bt.gstAmount > 0 ? (
              <>
                {row(bt.taxMode === "exclusive" ? "Taxable Amount (before GST)" : "Taxable Amount", money(bt.taxableAmount))}
                {row(`GST @ ${bt.gstPercent}% (${bt.taxMode === "exclusive" ? "added" : "included"})`, money(bt.gstAmount))}
                {row(`CGST @ ${bt.gstPercent / 2}%`, money(bt.cgst))}
                {row(`SGST @ ${bt.gstPercent / 2}%`, money(bt.sgst))}
              </>
            ) : (
              row("GST", "Non-GST bill")
            )}
            {bt.deliveryFee > 0 && row("Delivery", money(bt.deliveryFee))}
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-gray-600">Grand Total</span>
            <span className="text-xl font-black text-black">{money(bt.grandTotal)}</span>
          </div>

          {rows
            .filter((r) => !/^Bill Total/i.test(r.label))
            .map((r, i) => (
              <div key={i} className="flex justify-between items-center text-xs gap-2">
                <span className="font-semibold text-gray-600 min-w-0 break-words whitespace-pre-wrap">{r.label}</span>
                <span className={`text-sm shrink-0 ${r.strong ? "font-black" : "font-bold"} ${r.tone === "good" ? "text-emerald-600" : r.tone === "bad" ? "text-rose-600" : "text-black"}`}>
                  {r.value}
                </span>
              </div>
            ))}

          <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 sm:p-3.5 flex justify-between items-center mt-1">
            <span className="text-xs font-bold text-emerald-900">Balance Due</span>
            <span className="text-base sm:text-lg font-black text-emerald-900">₹0.00 · PAID</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <button onClick={() => onPrint?.(order)} className="bg-white border border-gray-300 hover:bg-gray-50 text-black py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer">
            <Printer className="w-3.5 h-3.5 text-[#F500A0]" /> Print Receipt
          </button>
          <button onClick={() => onView?.(order)} className="bg-white border border-gray-300 hover:bg-gray-50 text-black py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer">
            <Eye className="w-3.5 h-3.5 text-[#F500A0]" /> View
          </button>
          <button onClick={sendWhatsApp} className="bg-[#10B981] hover:bg-[#059669] text-white py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer">
            WhatsApp Invoice
          </button>
          <button onClick={onClose} className="bg-black hover:bg-black/80 text-white py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Done
          </button>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-5 border border-black/10 shadow-xs space-y-3">
          <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Items Sold</div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-gray-50 last:border-none">
                <span className="font-semibold text-black">
                  {item.name}{" "}
                  <span className="text-gray-400 font-bold text-[10px] ml-1">
                    × {item.qty} {item.qty === 1 ? "piece" : "pieces"}
                  </span>
                </span>
                <span className="font-bold text-black">{money((Number(item.price) || 0) * (Number(item.qty) || 1))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
