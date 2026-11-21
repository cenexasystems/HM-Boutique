"use client";

import React, { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { getStoredPrintPrefs, saveStoredPrintPrefs, type PrintPrefs } from "./PrintSettingsModal";

interface Props {
  open: boolean;
  onClose: () => void;
  /** called with the chosen printer type / paper size (also remembered for next time) */
  onConfirm: (prefs: PrintPrefs) => void;
}

const OPTION =
  "py-2 rounded-lg border-2 font-bold text-xs transition-all cursor-pointer";
const on = "border-[#F500A0] bg-[#F500A0]/5 text-[#F500A0]";
const off = "border-neutral-200 hover:border-neutral-300 text-neutral-600";

/** Same "Print Settings" dialog as the invoice print: Thermal Roll (58/80 mm) or Sheet (A4/A5). */
export default function PrintOptionsDialog({ open, onClose, onConfirm }: Props) {
  const [prefs, setPrefs] = useState<PrintPrefs>({ paper: "thermal", size: "80" });

  useEffect(() => {
    if (open) setPrefs(getStoredPrintPrefs());
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[600] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-neutral-200">
        <div className="bg-neutral-900 px-5 py-4 flex items-center justify-between border-b border-neutral-800">
          <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
            <Printer className="w-4 h-4 text-neutral-300" />
            Print Settings
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-xs font-black text-black uppercase tracking-wider mb-3">Printer Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPrefs({ paper: "thermal", size: prefs.size === "a4" || prefs.size === "a5" ? "80" : prefs.size })}
                className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all cursor-pointer ${prefs.paper === "thermal" ? on : off}`}
              >
                <span className="font-bold text-sm">Thermal Roll</span>
              </button>
              <button
                type="button"
                onClick={() => setPrefs({ paper: "a4", size: prefs.size === "58" || prefs.size === "80" ? "a4" : prefs.size })}
                className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all cursor-pointer ${prefs.paper === "a4" ? on : off}`}
              >
                <span className="font-bold text-sm">Sheet (A4/A5)</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-black uppercase tracking-wider mb-3">Paper Size</label>
            <div className="grid grid-cols-2 gap-3">
              {prefs.paper === "thermal" ? (
                <>
                  <button type="button" onClick={() => setPrefs({ ...prefs, size: "58" })} className={`${OPTION} ${prefs.size === "58" ? on : off}`}>
                    58 mm
                  </button>
                  <button type="button" onClick={() => setPrefs({ ...prefs, size: "80" })} className={`${OPTION} ${prefs.size === "80" ? on : off}`}>
                    80 mm
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setPrefs({ ...prefs, size: "a4" })} className={`${OPTION} ${prefs.size === "a4" ? on : off}`}>
                    A4 Sheet
                  </button>
                  <button type="button" onClick={() => setPrefs({ ...prefs, size: "a5" })} className={`${OPTION} ${prefs.size === "a5" ? on : off}`}>
                    A5 Sheet
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-xs font-bold text-neutral-600 hover:text-black uppercase tracking-wider cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              saveStoredPrintPrefs(prefs);
              onConfirm(prefs);
            }}
            className="px-6 py-3 rounded-xl bg-[#F500A0] hover:bg-[#D8008D] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print Now
          </button>
        </div>
      </div>
    </div>
  );
}
