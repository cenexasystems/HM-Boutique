"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Ruler, Search, Trash2, ChevronDown, Loader2, Phone, Calendar, Download, Settings2, RefreshCw } from "lucide-react";
import OptionsManager from "./MeasurementOptionsManager";
import NeckTypeIcon from "./NeckTypeIcon";
import { fetchMeasurements, removeMeasurement, updateMeasurementStatus } from "@/app/pos/actions";
import {
  MEASUREMENT_FIELDS,
  MEASUREMENT_STATUSES,
  periodStart,
  type MeasurementOrder,
  type MeasurementPeriod,
  type MeasurementStatus,
} from "@/lib/measurements";
import { toast } from "@/lib/toast";

const PERIODS: { id: MeasurementPeriod; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "year", label: "This Year" },
];

const STATUS_STYLE: Record<MeasurementStatus, { label: string; chip: string; card: string }> = {
  PENDING: { label: "Pending", chip: "bg-amber-50 text-amber-700 border-amber-200", card: "text-amber-600" },
  COMPLETED: { label: "Completed", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", card: "text-emerald-600" },
  CANCELLED: { label: "Cancelled", chip: "bg-red-50 text-red-700 border-red-200", card: "text-red-600" },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const fieldCls =
  "w-full bg-white border border-black/10 focus:border-[#F500A0] rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none";
const fieldLabel = "block text-[9px] font-black uppercase tracking-wider text-[#000000] mb-1";

export default function Measurements({
  canDelete,
  refreshKey = 0,
}: {
  canDelete: boolean;
  /** Bump to force a reload (e.g. after a bill with measurements is saved). */
  refreshKey?: number;
}) {
  const [records, setRecords] = useState<MeasurementOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<MeasurementPeriod>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchId, setSearchId] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | MeasurementStatus>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await fetchMeasurements());
    } catch (e) {
      setError((e as Error)?.message || "Failed to load measurements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  // Everything except the status filter, so the status cards can show counts for the other filters.
  const baseFiltered = useMemo(() => {
    const customRange = Boolean(fromDate || toDate);
    const start = customRange ? (fromDate ? new Date(`${fromDate}T00:00:00`) : null) : periodStart(period);
    const end = customRange && toDate ? new Date(`${toDate}T23:59:59.999`) : null;
    const id = searchId.trim().toLowerCase();
    const name = searchName.trim().toLowerCase();
    const phone = searchPhone.trim();
    return records.filter((r) => {
      const t = new Date(r.created_at);
      if (start && t < start) return false;
      if (end && t > end) return false;
      if (id && !r.invoice_no.toLowerCase().includes(id)) return false;
      if (name && !r.customer_name.toLowerCase().includes(name)) return false;
      if (phone && !r.phone.includes(phone)) return false;
      return true;
    });
  }, [records, period, fromDate, toDate, searchId, searchName, searchPhone]);

  const visible = useMemo(
    () => (statusFilter === "ALL" ? baseFiltered : baseFiltered.filter((r) => r.status === statusFilter)),
    [baseFiltered, statusFilter],
  );

  const counts = useMemo(() => {
    const c: Record<MeasurementStatus, number> = { PENDING: 0, COMPLETED: 0, CANCELLED: 0 };
    baseFiltered.forEach((r) => c[r.status]++);
    return c;
  }, [baseFiltered]);

  const changeStatus = async (r: MeasurementOrder, status: MeasurementStatus) => {
    const prev = r.status;
    setRecords((rs) => rs.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try {
      await updateMeasurementStatus(r.id, status);
    } catch (e) {
      setRecords((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: prev } : x)));
      toast.error((e as Error)?.message || "Failed to update status");
    }
  };

  const handleDelete = async (r: MeasurementOrder) => {
    if (!window.confirm(`Delete the measurements for ${r.invoice_no}?`)) return;
    try {
      await removeMeasurement(r.id);
      setRecords((rs) => rs.filter((x) => x.id !== r.id));
      toast.success("Measurements deleted");
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to delete");
    }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Order ID", "Date", "Customer", "Phone", "Status", "Items & Measurements"]];
    visible.forEach((r) => {
      const detail = r.items
        .map((it) => {
          const ms = MEASUREMENT_FIELDS.filter((f) => it.measurements?.[f.key])
            .map((f) => `${f.label} ${it.measurements[f.key]}`)
            .join(", ");
          const pat = [it.front_neck_type && `Front neck: ${it.front_neck_type}`, it.back_neck_type && `Back neck: ${it.back_neck_type}`, it.sleeve_type && `Sleeve: ${it.sleeve_type}`, it.sleeve_length && `Sleeve length: ${it.sleeve_length}`]
            .filter(Boolean)
            .join(", ");
          return `${it.item_name} [${[pat, ms, ...(it.remarks || [])].filter(Boolean).join("; ")}]`;
        })
        .join(" | ");
      rows.push([r.invoice_no, fmtDate(r.created_at), r.customer_name, r.phone, STATUS_STYLE[r.status].label, detail]);
    });
    const blob = new Blob(["﻿" + rows.map((row) => row.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `measurements-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header: title, period, date range, actions */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#000000] tracking-tight flex items-center gap-2">
            <Ruler className="w-6 h-6 text-[#F500A0]" /> Measurements
          </h2>
          <p className="text-xs font-semibold text-black/60 mt-1">Tailoring measurements for each saved bill</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1 bg-white border border-black/10 rounded-full px-3 py-1.5 shadow-sm">
            <span className="text-[9px] font-black uppercase tracking-wider text-black/60 mr-1">Period:</span>
            {PERIODS.map((p) => {
              const active = period === p.id && !fromDate && !toDate;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setPeriod(p.id);
                    setFromDate("");
                    setToDate("");
                  }}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors ${
                    active ? "bg-[#F500A0] text-white" : "text-[#000000] hover:bg-black/5"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 bg-white border border-black/10 rounded-full px-4 py-1.5 shadow-sm text-[9px] font-black uppercase tracking-wider">
            From:
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="text-xs font-bold normal-case bg-transparent focus:outline-none" />
            To:
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="text-xs font-bold normal-case bg-transparent focus:outline-none" />
          </div>
          <button
            onClick={exportCsv}
            disabled={visible.length === 0}
            className="text-xs font-black uppercase tracking-wider border-2 border-[#F500A0] text-[#F500A0] bg-white hover:bg-[#F500A0]/5 disabled:opacity-40 px-5 py-2.5 rounded-full flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Analytics: counts by status (follow the filters above) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: "ALL" as const, label: "Total Bills", value: baseFiltered.length, cls: "text-[#000000]" },
          ...MEASUREMENT_STATUSES.map((s) => ({ key: s, label: STATUS_STYLE[s].label, value: counts[s], cls: STATUS_STYLE[s].card })),
        ].map((c) => (
          <button
            key={c.key}
            onClick={() => setStatusFilter(c.key)}
            className={`text-left bg-white border-2 rounded-2xl px-4 py-3 shadow-sm cursor-pointer transition-colors ${
              statusFilter === c.key ? "border-[#F500A0]" : "border-black/10 hover:border-[#F500A0]/40"
            }`}
          >
            <div className="text-[9px] font-black uppercase tracking-wider text-black/60">{c.label}</div>
            <div className={`text-2xl font-black ${c.cls}`}>{c.value}</div>
          </button>
        ))}
      </div>

      {/* Search filters */}
      <div className="bg-white border border-black/10 rounded-2xl shadow-sm p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label className={fieldLabel}>Search Order ID</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
              <input value={searchId} onChange={(e) => setSearchId(e.target.value)} placeholder="e.g. INV-..." className={`${fieldCls} pl-9`} />
            </div>
          </div>
          <div>
            <label className={fieldLabel}>Customer Name</label>
            <input value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Search name..." className={fieldCls} />
          </div>
          <div>
            <label className={fieldLabel}>Customer Phone</label>
            <input value={searchPhone} onChange={(e) => setSearchPhone(e.target.value)} placeholder="Search phone..." className={fieldCls} />
          </div>
          <div>
            <label className={fieldLabel}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "ALL" | MeasurementStatus)} className={`${fieldCls} font-bold cursor-pointer`}>
              <option value="ALL">All Statuses</option>
              {MEASUREMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_STYLE[s].label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-start lg:justify-end">
            <button
              onClick={() => setShowOptions((v) => !v)}
              className={`text-[10px] font-bold uppercase tracking-wider border px-3 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer ${
                showOptions ? "bg-[#F500A0] border-[#F500A0] text-white" : "border-black/10 bg-white hover:bg-black/5"
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" /> Options
            </button>
            <button
              onClick={load}
              className="text-[10px] font-bold uppercase tracking-wider border border-black/10 bg-white px-3 py-2.5 rounded-lg flex items-center gap-1.5 hover:bg-black/5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {showOptions && <OptionsManager onClose={() => setShowOptions(false)} />}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl px-4 py-3">{error}</div>}

      {loading && records.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-black/50">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-black/10 rounded-2xl py-16 text-center">
          <Ruler className="w-8 h-8 mx-auto text-black/20 mb-2" />
          <p className="text-sm font-bold text-black/60">No measurements found</p>
          <p className="text-[11px] text-black/40 mt-1 px-4">
            Add measurements with the ruler icon on a billing item. They appear here once the bill is completed or saved as an advance order.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const open = openId === r.id;
            return (
              <div key={r.id} className="bg-white border border-black/10 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setOpenId(open ? null : r.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-black text-[#000000] truncate">{r.customer_name || "Guest"}</span>
                      <span className="text-[10px] font-bold text-[#F500A0] bg-[#F500A0]/5 border border-[#F500A0]/20 px-2 py-0.5 rounded-full">
                        {r.invoice_no}
                      </span>
                      {r.order_kind === "ADVANCE" && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-black/60 bg-black/5 px-2 py-0.5 rounded-full">Advance</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] font-semibold text-black/60">
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
                      <span>
                        {r.items.length} item{r.items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                  <select
                    value={r.status}
                    onChange={(e) => changeStatus(r, e.target.value as MeasurementStatus)}
                    className={`text-[10px] font-black uppercase tracking-wider border rounded-full px-3 py-1.5 cursor-pointer focus:outline-none ${STATUS_STYLE[r.status].chip}`}
                    aria-label="Status"
                  >
                    {MEASUREMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_STYLE[s].label}
                      </option>
                    ))}
                  </select>
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
                    {r.address && <div className="text-[11px] font-semibold text-black/60">Address: {r.address}</div>}
                    {r.items.map((it, idx) => {
                      const filled = MEASUREMENT_FIELDS.filter((f) => it.measurements?.[f.key]);
                      return (
                        <div key={idx} className="bg-white border border-black/10 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-black text-[#000000]">{it.item_name || `Item ${idx + 1}`}</div>
                            <div className="text-[11px] font-bold text-black/60 shrink-0">
                              {it.qty > 1 ? `${it.qty} × ` : ""}₹{Number(it.price || 0).toLocaleString("en-IN")}
                              {it.due_date && <span className="ml-3">Due {fmtDate(it.due_date)}</span>}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <Info label="Front Neck" value={it.front_neck_type} icon />
                            <Info label="Back Neck" value={it.back_neck_type} icon />
                            <Info label="Sleeve Type" value={it.sleeve_type} />
                            <Info label="Sleeve Length" value={it.sleeve_length} />
                          </div>
                          {filled.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {filled.map((f) => (
                                <div key={f.key} className="bg-[#FFF0F8]/60 border border-black/10 rounded-lg px-3 py-2">
                                  <div className="text-[9px] font-bold uppercase tracking-wider text-black/50">{f.label}</div>
                                  <div className="text-sm font-black">{it.measurements[f.key]} cm</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {it.remarks?.length > 0 && (
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-wider mb-1">Remarks</div>
                              <ul className="list-disc pl-5 space-y-0.5 text-xs font-semibold">
                                {it.remarks.map((m, i) => (
                                  <li key={i}>{m}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
