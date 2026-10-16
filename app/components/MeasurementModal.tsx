"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Ruler, Loader2, Pencil, ChevronLeft } from "lucide-react";
import NeckTypeIcon from "./NeckTypeIcon";
import {
  MEASUREMENT_FIELDS,
  NECK_TYPES,
  SLEEVE_TYPES,
  SLEEVE_LENGTHS,
  type MeasurementInput,
  type MeasurementOption,
  type MeasurementRecord,
} from "@/lib/measurements";
import { createMeasurement, editMeasurement, fetchMeasurementOptions } from "@/app/pos/actions";
import { toast } from "@/lib/toast";

type Props = {
  /** Pre-filled values (from the billing row) or the record being edited. */
  initial: MeasurementInput;
  /** When set, the modal edits this record instead of creating a new one. */
  editingId?: string | null;
  onClose: () => void;
  onSaved: (rec: MeasurementRecord) => void;
};

type Step = "neck" | "form";

const label = "block text-[10px] font-black uppercase tracking-wider text-[#000000] mb-1";
const input =
  "w-full bg-white border border-black/10 focus:border-[#F500A0] rounded-lg px-3 py-2 text-xs font-semibold text-[#000000] focus:outline-none transition-colors";

export default function MeasurementModal({ initial, editingId, onClose, onSaved }: Props) {
  const [data, setData] = useState<MeasurementInput>(initial);
  const [step, setStep] = useState<Step>(editingId ? "form" : "neck");
  const [neckTarget, setNeckTarget] = useState<"front" | "back">("front");
  const [customNeck, setCustomNeck] = useState("");
  const [saving, setSaving] = useState(false);
  const [extraOptions, setExtraOptions] = useState<MeasurementOption[]>([]);

  // Options added from the Measurements tab (best-effort: built-ins still work if this fails)
  useEffect(() => {
    fetchMeasurementOptions().then(setExtraOptions).catch(() => {});
  }, []);

  const withExtras = (kind: MeasurementOption["kind"], base: readonly string[]) => [
    ...base,
    ...extraOptions.filter((o) => o.kind === kind && !base.includes(o.name)).map((o) => o.name),
  ];
  const necks = useMemo(() => withExtras("neck", NECK_TYPES), [extraOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  const sleeveTypes = useMemo(() => withExtras("sleeve_type", SLEEVE_TYPES), [extraOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  const sleeveLengths = useMemo(() => withExtras("sleeve_length", SLEEVE_LENGTHS), [extraOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  // True only for the very first neck screen of a new measurement (Cancel closes; later it's Back).
  const [firstPick, setFirstPick] = useState(!editingId);

  const set = <K extends keyof MeasurementInput>(k: K, v: MeasurementInput[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const neckKey = neckTarget === "front" ? "front_neck_type" : "back_neck_type";
  const selectedNeck = data[neckKey];

  const openNeckPicker = (target: "front" | "back") => {
    setNeckTarget(target);
    setCustomNeck("");
    setStep("neck");
  };

  const handleSave = async () => {
    if (!data.customer_name.trim() && !data.phone.trim()) {
      toast.error("Enter a customer name or mobile number");
      return;
    }
    setSaving(true);
    try {
      const rec = editingId ? await editMeasurement(editingId, data) : await createMeasurement(data);
      toast.success(editingId ? "Measurement updated" : "Measurement saved");
      onSaved(rec);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save measurement");
    } finally {
      setSaving(false);
    }
  };

  const goForm = () => {
    setFirstPick(false);
    setStep("form");
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "neck" ? (
          <>
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-base font-black text-[#000000]">
                Select {neckTarget === "front" ? "Front" : "Back"} Neck Type
              </h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 pb-3 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                {necks.map((n) => {
                  const active = selectedNeck === n;
                  return (
                    <button
                      key={n}
                      onClick={() => set(neckKey, active ? "" : n)}
                      className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 transition-colors cursor-pointer ${
                        active
                          ? "border-[#F500A0] bg-[#F500A0]/5 text-[#F500A0]"
                          : "border-black/10 text-[#000000] hover:border-[#F500A0]/40"
                      }`}
                    >
                      <NeckTypeIcon type={n} />
                      <span className="text-xs font-bold">{n}</span>
                    </button>
                  );
                })}
                <div className="flex flex-col justify-center gap-1 p-2 rounded-xl border-2 border-dashed border-black/10">
                  <span className="text-[10px] font-black uppercase tracking-wider text-center">Custom</span>
                  <input
                    className={input}
                    placeholder="Type neck style"
                    value={necks.includes(selectedNeck) ? customNeck : selectedNeck}
                    onChange={(e) => {
                      setCustomNeck(e.target.value);
                      set(neckKey, e.target.value);
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-black/10 flex items-center justify-between gap-3">
              <button
                onClick={() => (firstPick ? onClose() : goForm())}
                className="text-xs font-bold text-[#000000] px-4 py-2.5 rounded-xl border border-black/10 hover:bg-black/5 cursor-pointer"
              >
                {firstPick ? "Cancel" : "Back"}
              </button>
              <button
                onClick={goForm}
                className="flex-1 bg-[#F500A0] hover:brightness-95 text-white text-xs font-black uppercase tracking-wider px-4 py-3 rounded-xl cursor-pointer"
              >
                {selectedNeck ? "Next" : "Skip / Next"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-black/10">
              <h3 className="text-base font-black text-[#000000] flex items-center gap-2">
                <Ruler className="w-4 h-4 text-[#F500A0]" />
                {editingId ? "Edit Measurement" : "Create Order"}
              </h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Customer */}
              <section className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-[#F500A0]">Customer Details</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Customer Name</label>
                    <input className={input} value={data.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="Customer name" />
                  </div>
                  <div>
                    <label className={label}>Mobile Number</label>
                    <input className={input} inputMode="tel" value={data.phone} onChange={(e) => set("phone", e.target.value)} placeholder="10-digit number" />
                  </div>
                </div>
                <div>
                  <label className={label}>Address (optional)</label>
                  <input className={input} value={data.address} onChange={(e) => set("address", e.target.value)} placeholder="Full address" />
                </div>
              </section>

              {/* Garment */}
              <section className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-[#F500A0]">Garment</h4>
                <div>
                  <label className={label}>Item / Style</label>
                  <input className={input} value={data.item_name} onChange={(e) => set("item_name", e.target.value)} placeholder="e.g. Princess-cut Blouse" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Price (₹)</label>
                    <input
                      className={input}
                      type="number"
                      min={0}
                      value={data.price || ""}
                      onChange={(e) => set("price", parseFloat(e.target.value) || 0)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className={label}>Due Date</label>
                    <input className={input} type="date" value={data.due_date || ""} onChange={(e) => set("due_date", e.target.value || null)} />
                  </div>
                </div>
              </section>

              {/* Patterns */}
              <section className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-[#F500A0]">Patterns</h4>
                {(["front", "back"] as const).map((t) => {
                  const v = data[t === "front" ? "front_neck_type" : "back_neck_type"];
                  return (
                    <div key={t}>
                      <label className={label}>{t} Neck Type</label>
                      <button
                        onClick={() => openNeckPicker(t)}
                        className={`${input} flex items-center justify-between text-left cursor-pointer`}
                      >
                        <span className={`flex items-center gap-2 ${v ? "" : "text-black/40"}`}>
                          {v && <NeckTypeIcon type={v} className="w-7 h-5 text-[#F500A0]" />}
                          {v || `Select ${t} neck type`}
                        </span>
                        <Pencil className="w-3.5 h-3.5 text-black/40" />
                      </button>
                    </div>
                  );
                })}
                <Chips title="Sleeve Type" options={sleeveTypes} value={data.sleeve_type} onChange={(v) => set("sleeve_type", v)} />
                <Chips title="Sleeve Length" options={sleeveLengths} value={data.sleeve_length} onChange={(v) => set("sleeve_length", v)} />
              </section>

              {/* Measurements */}
              <section className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-[#F500A0]">Measurements (cm)</h4>
                <div className="grid grid-cols-2 gap-3">
                  {MEASUREMENT_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className={label}>{f.label}</label>
                      <div className="relative">
                        <input
                          className={`${input} pr-8`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.1"
                          value={data.measurements[f.key] ?? ""}
                          onChange={(e) => set("measurements", { ...data.measurements, [f.key]: e.target.value })}
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-black/40">cm</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Remarks */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-[#F500A0]">Remarks</h4>
                  <button
                    onClick={() => set("remarks", [...data.remarks, ""])}
                    className="text-[10px] font-bold text-[#F500A0] bg-[#F500A0]/5 border border-[#F500A0]/20 px-3 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Remark
                  </button>
                </div>
                {data.remarks.length === 0 && <p className="text-[11px] text-black/50 font-semibold">No remarks added.</p>}
                {data.remarks.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <textarea
                      rows={2}
                      className={`${input} resize-none`}
                      value={r}
                      placeholder={`Remark ${i + 1}`}
                      onChange={(e) => set("remarks", data.remarks.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                    <button
                      onClick={() => set("remarks", data.remarks.filter((_, j) => j !== i))}
                      className="p-2 rounded-lg border border-black/10 hover:bg-black/5 cursor-pointer shrink-0"
                      aria-label="Remove remark"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </section>
            </div>

            <div className="px-5 py-4 border-t border-black/10 flex items-center gap-3">
              {!editingId && (
                <button
                  onClick={() => openNeckPicker("front")}
                  className="p-2.5 rounded-xl border border-black/10 hover:bg-black/5 cursor-pointer"
                  aria-label="Back to neck types"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[#F500A0] hover:brightness-95 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wider px-4 py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Update Measurement" : "Save Measurement"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Chips({ title, options, value, onChange }: { title: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={label}>{title}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(value === o ? "" : o)}
            className={`px-3 py-1.5 rounded-full border text-xs font-bold cursor-pointer transition-colors ${
              value === o ? "bg-[#F500A0] border-[#F500A0] text-white" : "border-black/10 text-[#000000] hover:border-[#F500A0]/40"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
