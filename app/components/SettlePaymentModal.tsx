"use client";

import React, { useEffect, useState } from "react";
import type { SettlementPayment } from "@/lib/completeOrder";

interface Props {
  open: boolean;
  title: string;
  /** Amount still to be collected. */
  balance: number;
  busy?: boolean;
  onConfirm: (payment: SettlementPayment) => void;
  onClose: () => void;
}

const inr = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SettlePaymentModal({ open, title, balance, busy, onConfirm, onClose }: Props) {
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

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div>
          <h3 className="text-sm font-black text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Balance to collect: <b className="text-gray-900">₹{inr(balance)}</b>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(["CASH", "GPAY", "SPLIT"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`py-2 rounded-lg text-xs font-black border cursor-pointer ${
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
                  onChange={(e) => setCash(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-[10px] font-bold uppercase text-gray-500">
                GPay ₹
                <input
                  type="number"
                  min="0"
                  value={gpay}
                  onChange={(e) => setGpay(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <p className={`text-[11px] font-bold ${diff === 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {diff === 0
                ? "Split matches the balance"
                : diff > 0
                ? `₹${inr(diff)} still short`
                : `₹${inr(-diff)} extra`}
            </p>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 cursor-pointer">
            Cancel
          </button>
          <button
            disabled={!splitOk || busy}
            onClick={() => onConfirm({ mode, cash: cashN, gpay: gpayN })}
            className="px-4 py-2 text-xs font-black rounded-lg bg-[#F500A0] text-white disabled:opacity-40 cursor-pointer"
          >
            {busy ? "Saving…" : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
