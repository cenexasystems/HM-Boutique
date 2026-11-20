"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Ruler, Search, Trash2, ChevronDown, Loader2, Phone, Calendar, Download, Settings2, RefreshCw, Printer } from "lucide-react";
import OptionsManager from "./MeasurementOptionsManager";
import NeckTypeIcon from "./NeckTypeIcon";
import { fetchMeasurements, removeMeasurement, updateMeasurementStatus } from "@/app/pos/actions";
import {
  MEASUREMENT_FIELDS,
  MEASUREMENT_STATUSES,
  periodRange,
  toYmd,
  unwrap,
  type MeasurementOrder,
  type MeasurementPeriod,
  type MeasurementStatus,
} from "@/lib/measurements";
import { toast } from "@/lib/toast";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx";

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
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchId, setSearchId] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | MeasurementStatus>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  // Period buttons just fill From/To; the highlighted button is whichever range matches the dates.
  const activePeriod = PERIODS.find((p) => {
    const r = periodRange(p.id);
    return r.from === fromDate && r.to === toDate;
  })?.id;
  const selectPeriod = (p: MeasurementPeriod) => {
    const r = periodRange(p);
    setFromDate(r.from);
    setToDate(r.to);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(unwrap(await fetchMeasurements()));
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
    const start = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const end = toDate ? new Date(`${toDate}T23:59:59.999`) : null;
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
  }, [records, fromDate, toDate, searchId, searchName, searchPhone]);

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
      unwrap(await updateMeasurementStatus(r.id, status));
    } catch (e) {
      setRecords((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: prev } : x)));
      toast.error((e as Error)?.message || "Failed to update status");
    }
  };

  const handleDelete = async (r: MeasurementOrder) => {
    if (!window.confirm(`Delete the measurements for ${r.invoice_no}?`)) return;
    try {
      unwrap(await removeMeasurement(r.id));
      setRecords((rs) => rs.filter((x) => x.id !== r.id));
      toast.success("Measurements deleted");
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to delete");
    }
  };

  // One row per billed item, one column per measurement - opens cleanly in Excel.
  const exportExcel = () => {
    const headers = [
      "Order ID", "Bill Type", "Date", "Customer", "Phone", "Status", "Item", "Qty", "Price (₹)", "Due Date",
      "Front Neck", "Back Neck", "Sleeve Type", "Sleeve Length",
      ...MEASUREMENT_FIELDS.map((f) => `${f.label} (cm)`),
      "Remarks",
    ];
    const rows: XlsxCell[][] = [];
    visible.forEach((r) => {
      r.items.forEach((it) => {
        rows.push([
          r.invoice_no,
          r.order_kind === "ADVANCE" ? "Advance" : "Invoice",
          fmtDate(r.created_at),
          r.customer_name,
          r.phone,
          STATUS_STYLE[r.status].label,
          it.item_name,
          Number(it.qty) || 1,
          Number(it.price) || 0,
          it.due_date ? fmtDate(it.due_date) : "",
          it.front_neck_type,
          it.back_neck_type,
          it.sleeve_type,
          it.sleeve_length,
          ...MEASUREMENT_FIELDS.map((f) => {
            const v = parseFloat(it.measurements?.[f.key] ?? "");
            return Number.isFinite(v) ? v : "";
          }),
          (it.remarks || []).map((m, i) => `${i + 1}. ${m}`).join("\n"),
        ]);
      });
    });
    const widths = [20, 10, 14, 22, 14, 12, 28, 6, 12, 14, 16, 16, 14, 14, ...MEASUREMENT_FIELDS.map(() => 13), 40];
    const blob = buildXlsx({ sheetName: "Measurements", headers, rows, widths });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `measurements-${toYmd(new Date())}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Prints the given bills in a clean, tailor-friendly layout via a popup window.
  const printRecords = (list: MeasurementOrder[]) => {
    if (list.length === 0) return;
    const esc = (s: unknown) =>
      String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
    // One A4 page per billed item: header, big measurement boxes, remarks and a notes area
    // that stretches to fill the rest of the page.
    const pages: string[] = [];
    list.forEach((r) => {
      const total = r.items.length;
      r.items.forEach((it, idx) => {
        const filled = MEASUREMENT_FIELDS.filter((f) => it.measurements?.[f.key]);
        const info = [
          ["Front Neck", it.front_neck_type],
          ["Back Neck", it.back_neck_type],
          ["Sleeve Type", it.sleeve_type],
          ["Sleeve Length", it.sleeve_length],
        ];
        pages.push(`<section class="page">
          <header>
            <div class="top">
              <div>
                <div class="cust">${esc(r.customer_name || "Guest")}</div>
                <div class="sub">${r.phone ? `Phone: ${esc(r.phone)}` : ""}${r.address ? ` &nbsp;·&nbsp; ${esc(r.address)}` : ""}</div>
              </div>
              <div class="inv">
                <div class="no">${esc(r.invoice_no)}</div>
                <div class="sub">Date: ${esc(fmtDate(r.created_at))}</div>
                <div class="sub">Status: ${esc(STATUS_STYLE[r.status].label)}</div>
              </div>
            </div>
          </header>

          <div class="item">
            <div class="row">
              <div class="name">${esc(it.item_name || `Item ${idx + 1}`)}<span class="cnt">${total > 1 ? ` (item ${idx + 1} of ${total})` : ""}</span></div>
              <div class="price">${it.qty > 1 ? `${esc(it.qty)} × ` : ""}₹${Number(it.price || 0).toLocaleString("en-IN")}${it.due_date ? `<br><span class="due">Due: ${esc(fmtDate(it.due_date))}</span>` : ""}</div>
            </div>
            <div class="info">${info.map(([l, v]) => `<div class="cell"><span>${l}</span><b>${esc(v || "-")}</b></div>`).join("")}</div>
          </div>

          <div class="h">Measurements</div>
          ${
            filled.length
              ? `<div class="grid">${filled.map((f) => `<div class="m"><span>${esc(f.label)}</span><b>${esc(it.measurements[f.key])}<i> cm</i></b></div>`).join("")}</div>`
              : `<div class="none">No measurements recorded</div>`
          }

          <div class="h">Remarks</div>
          <div class="remarks">${
            it.remarks?.length ? `<ol>${it.remarks.map((m) => `<li>${esc(m)}</li>`).join("")}</ol>` : ""
          }</div>

          <div class="h">Tailor Notes</div>
          <div class="notes"></div>
        </section>`);
      });
    });
    const body = pages.join("");
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Allow pop-ups to print");
      return;
    }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Measurements</title><style>
      @page { size: A4 portrait; margin: 10mm; }
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .page{display:flex;flex-direction:column;min-height:274mm;page-break-after:always;padding:2mm 1mm}
      .page:last-child{page-break-after:auto}
      header{border-bottom:3px solid #F500A0;padding-bottom:5mm;margin-bottom:6mm}
      .top{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm}
      .cust{font-size:28px;font-weight:800;line-height:1.1}
      .inv{text-align:right}.inv .no{font-size:20px;font-weight:800;color:#F500A0;font-family:"Courier New",monospace}
      .sub{font-size:14px;color:#333;margin-top:2mm}
      .item{border:2px solid #222;border-radius:3mm;padding:5mm;margin-bottom:6mm}
      .row{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm}
      .name{font-size:24px;font-weight:800}.cnt{font-size:14px;font-weight:600;color:#555}
      .price{text-align:right;font-size:20px;font-weight:700}.due{font-size:14px;font-weight:600;color:#B45309}
      .info{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin-top:5mm}
      .cell{border:1px solid #bbb;border-radius:2mm;padding:3mm}
      .cell span{display:block;font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.05em}
      .cell b{display:block;font-size:17px;margin-top:1mm}
      .h{font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#F500A0;margin:2mm 0 3mm}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-bottom:6mm}
      .m{border:2px solid #222;border-radius:3mm;padding:4mm 5mm;min-height:24mm;display:flex;flex-direction:column;justify-content:space-between}
      .m span{font-size:13px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:.04em}
      .m b{font-size:30px;font-weight:800;line-height:1.1}.m i{font-size:15px;font-style:normal;font-weight:600;color:#444}
      .none{font-size:15px;color:#777;margin-bottom:6mm}
      .remarks{border:1px solid #bbb;border-radius:2mm;padding:4mm 6mm;min-height:22mm;font-size:16px;margin-bottom:6mm}
      .remarks ol{margin:0;padding-left:6mm}.remarks li{margin-bottom:1.5mm}
      .notes{flex:1;min-height:30mm;border:1px solid #bbb;border-radius:2mm;
        background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 9mm,#ddd 9mm,#ddd 9.3mm)}
    </style></head><body>${body}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
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
              const active = activePeriod === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectPeriod(p.id)}
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
            onClick={exportExcel}
            disabled={visible.length === 0}
            className="text-xs font-black uppercase tracking-wider border-2 border-[#F500A0] text-[#F500A0] bg-white hover:bg-[#F500A0]/5 disabled:opacity-40 px-5 py-2.5 rounded-full flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export Excel
          </button>
          <button
            onClick={() => printRecords(visible)}
            disabled={visible.length === 0}
            className="text-xs font-black uppercase tracking-wider border-2 border-[#F500A0] text-[#F500A0] bg-white hover:bg-[#F500A0]/5 disabled:opacity-40 px-5 py-2.5 rounded-full flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print
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
                  <button onClick={() => printRecords([r])} className="p-2 rounded-lg border border-black/10 hover:bg-black/5 cursor-pointer" aria-label="Print">
                    <Printer className="w-4 h-4" />
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
