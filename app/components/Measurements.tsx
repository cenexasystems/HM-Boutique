"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Ruler, Search, Pencil, Trash2, ChevronDown, Loader2, Phone, Calendar, RefreshCw, Settings2 } from "lucide-react";
import OptionsManager from "./MeasurementOptionsManager";
import MeasurementModal from "./MeasurementModal";
import NeckTypeIcon from "./NeckTypeIcon";
import { fetchMeasurements, removeMeasurement } from "@/app/pos/actions";
import {
  MEASUREMENT_FIELDS,
  periodStart,
  type MeasurementPeriod,
  type MeasurementRecord,
} from "@/lib/measurements";
import { toast } from "@/lib/toast";

const PERIODS: { id: MeasurementPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "all", label: "All" },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";

export default function Measurements({
  canDelete,
  refreshKey = 0,
}: {
  canDelete: boolean;
  /** Bump to force a reload (e.g. after saving from the billing panel). */
  refreshKey?: number;
}) {
  const [records, setRecords] = useState<MeasurementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<MeasurementPeriod>("today");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MeasurementRecord | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  const load = async () => {
    try {
      setRecords(await fetchMeasurements());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load measurements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchRecords = async () => {
      try {
        const fetchedRecords = await fetchMeasurements();
        if (!cancelled) {
          setRecords(fetchedRecords);
          setError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load measurements");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchRecords();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const countFor = (p: MeasurementPeriod) => {
    const start = periodStart(p);
    return start ? records.filter((r) => new Date(r.created_at) >= start).length : records.length;
  };

  const visible = useMemo(() => {
    const start = periodStart(period);
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (start && new Date(r.created_at) < start) return false;
      if (!q) return true;
      return [r.customer_name, r.phone, r.item_name, r.measurement_no].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [records, period, search]);

  const handleDelete = async (r: MeasurementRecord) => {
    if (!window.confirm(`Delete measurement for ${r.customer_name || "this customer"}?`)) return;
    try {
      await removeMeasurement(r.id);
      setRecords((rs) => rs.filter((x) => x.id !== r.id));
      toast.success("Measurement deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[#000000] flex items-center gap-2">
            <Ruler className="w-5 h-5 text-[#F500A0]" /> Measurements
          </h2>
          <p className="text-xs font-semibold text-black/60 mt-0.5">Saved customer measurements and tailoring specs</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowOptions((v) => !v)}
            className={`text-[10px] font-bold uppercase tracking-wider border px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer ${
              showOptions ? "bg-[#F500A0] border-[#F500A0] text-white" : "border-black/10 bg-white hover:bg-black/5"
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" /> Manage Options
          </button>
          <button
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="text-[10px] font-bold uppercase tracking-wider border border-black/10 bg-white px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-black/5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {showOptions && <OptionsManager onClose={() => setShowOptions(false)} />}

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                period === p.id ? "bg-[#F500A0] border-[#F500A0] text-white" : "bg-white border-black/10 text-[#000000] hover:border-[#F500A0]/40"
              }`}
            >
              {p.label}
              <span className={`ml-1.5 text-[10px] ${period === p.id ? "text-white/80" : "text-black/40"}`}>{countFor(p.id)}</span>
            </button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, item or ID"
            className="w-full bg-white border border-black/10 focus:border-[#F500A0] rounded-lg pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none"
          />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl px-4 py-3">{error}</div>}

      {loading && records.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-black/50">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-black/10 rounded-2xl py-16 text-center">
          <Ruler className="w-8 h-8 mx-auto text-black/20 mb-2" />
          <p className="text-sm font-bold text-black/60">No measurements {period === "all" ? "yet" : "for this period"}</p>
          <p className="text-[11px] text-black/40 mt-1">Use the ruler icon next to an item in the Billing Panel to add one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const open = openId === r.id;
            const filled = MEASUREMENT_FIELDS.filter((f) => r.measurements[f.key]);
            return (
              <div key={r.id} className="bg-white border border-black/10 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setOpenId(open ? null : r.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-black text-[#000000] truncate">{r.customer_name || "Walk-in Customer"}</span>
                      <span className="text-[10px] font-bold text-[#F500A0] bg-[#F500A0]/5 border border-[#F500A0]/20 px-2 py-0.5 rounded-full">
                        {r.measurement_no}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] font-semibold text-black/60">
                      {r.item_name && <span>{r.item_name}</span>}
                      {r.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {r.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {fmtDate(r.created_at)}
                      </span>
                      {r.due_date && <span>Due {fmtDate(r.due_date)}</span>}
                    </div>
                  </button>
                  <button onClick={() => setEditing(r)} className="p-2 rounded-lg border border-black/10 hover:bg-black/5 cursor-pointer" aria-label="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  {canDelete && (
                    <button onClick={() => handleDelete(r)} className="p-2 rounded-lg border border-black/10 hover:bg-black/5 cursor-pointer" aria-label="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => setOpenId(open ? null : r.id)} className="p-2 cursor-pointer" aria-label="Toggle details">
                    <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {open && (
                  <div className="border-t border-black/10 p-4 space-y-4 bg-[#FFF0F8]/40">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <Info label="Front Neck" value={r.front_neck_type} icon />
                      <Info label="Back Neck" value={r.back_neck_type} icon />
                      <Info label="Sleeve Type" value={r.sleeve_type} />
                      <Info label="Sleeve Length" value={r.sleeve_length} />
                    </div>
                    {filled.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider mb-2">Measurements (cm)</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {filled.map((f) => (
                            <div key={f.key} className="bg-white border border-black/10 rounded-lg px-3 py-2">
                              <div className="text-[9px] font-bold uppercase tracking-wider text-black/50">{f.label}</div>
                              <div className="text-sm font-black">{r.measurements[f.key]}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {r.remarks.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider mb-2">Remarks</div>
                        <ul className="list-disc pl-5 space-y-1 text-xs font-semibold">
                          {r.remarks.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.address && <div className="text-[11px] font-semibold text-black/60">Address: {r.address}</div>}
                    {r.price > 0 && <div className="text-xs font-black">Price: ₹{r.price.toLocaleString("en-IN")}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <MeasurementModal
          editingId={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(rec) => {
            setRecords((rs) => rs.map((x) => (x.id === rec.id ? rec : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-black/50">{label}</div>
      <div className="font-bold flex items-center gap-1.5 text-[#000000]">
        {icon && value && <NeckTypeIcon type={value} className="w-6 h-4 text-[#F500A0]" />}
        {value || "-"}
      </div>
    </div>
  );
}
