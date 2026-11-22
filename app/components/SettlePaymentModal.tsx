"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { SettlementPayment } from "@/lib/completeOrder";
import { getOrderTotals } from "@/lib/orderTotals";

interface Props {
  open: boolean;
  title: string;
  /** Amount still to be collected. */
  balance: number;
  /** The credit bill being settled - shown in the same layout as the "Bill Generated" popup. */
  order?: any | null;
  busy?: boolean;
  onConfirm: (payment: SettlementPayment) => void;
  onClose: () => void;
}

const inr = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => `₹${inr(n)}`;

export default function SettlePaymentModal({ open, title, balance, order, busy, onConfirm, onClose }: Props) {
  const [mode, setMode] = useState<"CASH" | "GPAY" | "SPLIT">("CASH");
  const [cash, setCash] = useState("");
  const [gpay, setGpay] = useState("");

  useEffect(() => {
    if (open) {
      setMode("CASH");
      setCash("");
      setGpay("");
    }
  }, [open]);

  if (!open) return null;

  const cashN = Number(cash) || 0;
  const gpayN = Number(gpay) || 0;
  const diff = Math.round((balance - (cashN + gpayN)) * 100) / 100;
  const splitOk = mode !== "SPLIT" || diff === 0;

  const bt = order ? getOrderTotals(order) : null;
  const invoiceNo = order ? order.invoiceNo || order.invoice_no || order.id : "";
  const items: any[] = order && Array.isArray(order.items) ? order.items : [];
  const dueRaw = order ? order.credit_due_date || order.due_date : null;
  const due = dueRaw ? new Date(String(dueRaw)) : null;

  const row = (l: string, v: string, cls = "") => (
    <div key={l} className="flex justify-between items-center text-xs">
      <span className="font-semibold text-gray-600">{l}</span>
      <span className={`font-bold text-black ${cls}`}>{v}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex flex-col gap-4 w-full max-w-[640px] min-w-0 bg-white rounded-2xl shadow-2xl p-4 sm:p-5 max-h-[94vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-black/10">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight">Bill Generated</h1>
              {bt && (
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${bt.gstAmount > 0 ? "bg-[#F500A0]/10 text-[#F500A0]" : "bg-black/5 text-[#111827]"}`}>
                  {bt.gstAmount > 0 ? "GST" : "Non-GST"}
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono font-bold text-[#F500A0] mt-0.5">{invoiceNo ? `#${invoiceNo}` : title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-black hover:bg-gray-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Payment receipt card */}
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-black/10 shadow-xs space-y-3">
          <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2 flex justify-between items-center">
            <span>Payment Receipt</span>
            <span className="text-[9px] font-black text-[#F500A0] bg-black/5 px-2 py-0.5 rounded">Credit · Unpaid</span>
          </div>

          {bt && (
            <div className="space-y-1.5 pb-2 border-b border-dashed border-gray-200">
              {row("Subtotal", money(bt.subtotal))}
              {bt.manualDiscount > 0 &&
                row(`Manual Discount${bt.discountType === "PERCENT" && bt.discountValue > 0 ? ` (${bt.discountValue}%)` : ""}`, `-${money(bt.manualDiscount)}`, "text-[#F500A0]")}
              {bt.couponDiscount > 0 &&
                row(`Coupon${order?.coupon_code ? ` (${order.coupon_code})` : ""}`, `-${money(bt.couponDiscount)}`, "text-[#F500A0]")}
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
          )}

          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-gray-600">Grand Total</span>
            <span className="text-xl font-black text-black">{money(bt ? bt.grandTotal : balance)}</span>
          </div>

          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 sm:p-3.5 flex justify-between items-center">
            <span className="text-xs font-bold text-amber-900">Balance Due (on credit)</span>
            <span className="text-base sm:text-lg font-black text-amber-900">{money(balance)}</span>
          </div>

          {due && !isNaN(due.getTime()) && (
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-gray-600">Payment Due Date</span>
              <span className="font-black text-black">
                {due.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            </div>
          )}
        </div>

        {/* Collect payment */}
        <div className="rounded-xl p-4 sm:p-5 border border-[#F500A0]/30 bg-[#F500A0]/5 space-y-3">
          <div className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest">
            How is the customer paying {money(balance)}?
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["CASH", "GPAY", "SPLIT"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`py-2.5 rounded-lg text-xs font-black border cursor-pointer ${
                  mode === m ? "bg-[#F500A0] text-white border-[#F500A0]" : "bg-white text-gray-700 border-gray-200"
                }`}
              >
                {m === "GPAY" ? "GPay" : m === "CASH" ? "Cash" : "Split"}
              </button>
            ))}
          </div>

          {mode === "SPLIT" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-bold uppercase text-gray-500">
                  Cash ₹
                  <input
                    type="number"
                    min="0"
                    value={cash}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCash(v);
                      setGpay(v === "" ? "" : String(Math.max(0, Math.round((balance - (Number(v) || 0)) * 100) / 100)));
                    }}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                  />
                </label>
                <label className="text-[10px] font-bold uppercase text-gray-500">
                  GPay ₹
                  <input
                    type="number"
                    min="0"
                    value={gpay}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGpay(v);
                      setCash(v === "" ? "" : String(Math.max(0, Math.round((balance - (Number(v) || 0)) * 100) / 100)));
                    }}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                  />
                </label>
              </div>
              <p className={`text-[11px] font-bold ${diff === 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {diff === 0 ? "Split matches the balance" : diff > 0 ? `₹${inr(diff)} still short` : `₹${inr(-diff)} extra`}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={onClose} className="bg-white border border-gray-300 hover:bg-gray-50 text-black py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider cursor-pointer">
              Cancel
            </button>
            <button
              disabled={!splitOk || busy}
              onClick={() => onConfirm({ mode, cash: cashN, gpay: gpayN })}
              className="bg-[#F500A0] hover:bg-[#D8008D] text-white py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider disabled:opacity-40 cursor-pointer"
            >
              {busy ? "Saving…" : "Confirm Payment"}
            </button>
          </div>
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div className="bg-white rounded-xl p-4 sm:p-5 border border-black/10 shadow-xs space-y-3">
            <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Items Sold</div>
            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
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
        )}
      </div>
    </div>
  );
}
