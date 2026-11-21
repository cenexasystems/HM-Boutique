"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ruler, Search, Trash2, ChevronDown, Loader2, Phone, Calendar, Download, Settings2, RefreshCw, Printer, X, ExternalLink, Eye } from "lucide-react";
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
import PrintOptionsDialog from "./PrintOptionsDialog";
import { getStoredPrintPrefs, type PrintPrefs } from "./PrintSettingsModal";
import { BRAND_EN, BRAND_ADDRESS, BRAND_PHONE_DISPLAY, BRAND_EMAIL } from "@/lib/brand";
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
  // In-app print preview (like the invoice preview) - Print happens from inside it
  const [preview, setPreview] = useState<{ html: string; title: string; list: MeasurementOrder[] } | null>(null);
  // Print Settings dialog (thermal roll 58/80 mm or sheet A4/A5), same as the invoice print
  const [printDialog, setPrintDialog] = useState<{ list: MeasurementOrder[]; fromPreview: boolean } | null>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);

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

  // Thermal roll (58 / 80 mm): a narrow receipt-style sheet, one page per billed item
  const buildThermalDoc = (list: MeasurementOrder[], mm: 58 | 80): { html: string; title: string } => {
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
    const kv = (label: string, value: unknown) => `<div class="kv"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
    const sheets: string[] = [];
    list.forEach((r) => {
      const total = r.items.length;
      r.items.forEach((it, idx) => {
        const filled = MEASUREMENT_FIELDS.filter((f) => it.measurements?.[f.key]);
        const info: [string, string][] = [
          ["Front Neck", it.front_neck_type],
          ["Back Neck", it.back_neck_type],
          ["Sleeve", it.sleeve_type],
          ["Sleeve Len", it.sleeve_length],
        ];
        sheets.push(`<section class="t">
          <div class="c shop">${esc(BRAND_EN)}</div>
          <div class="c sm">${esc(BRAND_ADDRESS)}</div>
          <div class="c sm">Ph: +91 ${esc(BRAND_PHONE_DISPLAY)}</div>
          <div class="dash"></div>
          <div class="c title">MEASUREMENT SHEET</div>
          ${kv("Bill", "#" + r.invoice_no)}
          ${kv("Date", fmtDate(r.created_at))}
          ${kv("Customer", r.customer_name || "Guest")}
          ${r.phone ? kv("Phone", r.phone) : ""}
          <div class="dash"></div>
          <div class="item">${esc(it.item_name || `Item ${idx + 1}`)}${total > 1 ? ` (${idx + 1}/${total})` : ""}</div>
          ${kv("Qty x Price", `${it.qty || 1} x ₹${Number(it.price || 0).toLocaleString("en-IN")}`)}
          ${it.due_date ? kv("Due", fmtDate(it.due_date)) : ""}
          ${info.map(([l, v]) => (v ? kv(l, v) : "")).join("")}
          <div class="dash"></div>
          <div class="c title">MEASUREMENTS (cm)</div>
          ${filled.length ? filled.map((f) => kv(f.label, it.measurements[f.key])).join("") : `<div class="c sm">None recorded</div>`}
          ${it.remarks?.length ? `<div class="dash"></div><div class="title">REMARKS</div><ol class="rem">${it.remarks.map((m) => `<li>${esc(m)}</li>`).join("")}</ol>` : ""}
          <div class="sig"><div class="line"></div><div class="sl">Authorized Signature</div></div>
          <div class="c sm foot">Powered by Cenexa Systems © 2026</div>
        </section>`);
      });
    });
    const fs = mm === 58 ? 10 : 11.5;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Measurements</title><style>
      @page { size: ${mm}mm auto; margin: 0; }
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;font-family:"Courier New",monospace;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .t{width:${mm}mm;padding:3mm 3mm 7mm;font-size:${fs}px;line-height:1.35;page-break-after:always}
      .t:last-child{page-break-after:auto}
      .c{text-align:center}.shop{font-weight:900;font-size:${fs + 2}px;text-transform:uppercase;line-height:1.2}.sm{font-size:${fs - 1.5}px}
      .title{font-weight:800;letter-spacing:.06em;margin:1.5mm 0}
      .dash{border-top:1px dashed #000;margin:2mm 0}
      .kv{display:flex;justify-content:space-between;gap:2mm}.kv span{flex-shrink:0}.kv b{text-align:right;word-break:break-word}
      .item{font-weight:900;font-size:${fs + 1}px;margin-bottom:1mm;word-break:break-word}
      .rem{margin:1mm 0 0;padding-left:4mm}
      .sig{margin-top:10mm;text-align:center}.sig .line{border-top:1px solid #000;margin:0 4mm 1mm}.sl{font-weight:800}
      .foot{margin-top:3mm}
      @media screen{html,body{background:#d9dce1}body{padding:10px 0}.t{margin:0 auto 14px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.22)}}
    </style></head><body>${sheets.join("")}</body></html>`;
    return { html, title: list.length === 1 ? `#${list[0].invoice_no}` : `${list.length} bills` };
  };

  // Builds the print document for the chosen printer type / paper size (default: last choice).
  const buildPrintDoc = (
    list: MeasurementOrder[],
    prefs: PrintPrefs = getStoredPrintPrefs(),
  ): { html: string; title: string } | null => {
    if (list.length === 0) return null;
    if (prefs.paper === "thermal") return buildThermalDoc(list, prefs.size === "58" ? 58 : 80);
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
            <div class="brand">
              <div>
                <div class="shop">${esc(BRAND_EN)}</div>
                <div class="addr">${esc(BRAND_ADDRESS)}</div>
                <div class="addr strong">Phone: +91 ${esc(BRAND_PHONE_DISPLAY)} &nbsp;•&nbsp; Email: ${esc(BRAND_EMAIL)}</div>
                <div class="addr strong">Place of Supply: Tamil Nadu (33)</div>
              </div>
              <div class="tagwrap">
                <span class="tag">MEASUREMENT SHEET</span>
                <div class="no">#${esc(r.invoice_no)}</div>
                <div class="sub">${esc(fmtDate(r.created_at))}</div>
                <div class="sub">Status: ${esc(STATUS_STYLE[r.status].label)}</div>
              </div>
            </div>
            <div class="billed">
              <div>
                <div class="lbl">Billed To</div>
                <div class="cust">${esc(r.customer_name || "Guest")}</div>
                <div class="sub">${r.phone ? `+91 ${esc(r.phone)}` : ""}${r.address ? ` &nbsp;·&nbsp; ${esc(r.address)}` : ""}</div>
              </div>
              <div class="supply">
                <div class="lbl">Place of Supply</div>
                <div class="pos">Tamil Nadu (33)</div>
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
              ? `<div class="grid" style="grid-template-columns:repeat(${filled.length > 9 ? 4 : 3},1fr)">${filled.map((f) => `<div class="m"><span>${esc(f.label)}</span><b>${esc(it.measurements[f.key])}<i> cm</i></b></div>`).join("")}</div>`
              : `<div class="none">No measurements recorded</div>`
          }

          <div class="h">Remarks</div>
          <div class="remarks">${
            it.remarks?.length ? `<ol>${it.remarks.map((m) => `<li>${esc(m)}</li>`).join("")}</ol>` : ""
          }</div>

          <div class="h">Tailor Notes</div>
          <div class="notes"></div>

          <div class="signrow">
            <div class="sign">
              <div class="sigline"></div>
              <div class="siglabel">Authorized Signature</div>
              <div class="sigshop">For ${esc(BRAND_EN)}</div>
            </div>
          </div>
          <div class="foot">Powered by Cenexa Systems © 2026</div>
        </section>`);
      });
    });
    const body = pages.join("");
    let html = `<!doctype html><html><head><meta charset="utf-8"><title>Measurements</title><style>
      @page { size: A4 portrait; margin: 6mm; }
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      /* one item = one A4 sheet: 297mm tall in total (6mm page margin + 285mm sheet + 6mm) */
      .page{display:flex;flex-direction:column;height:285mm;overflow:hidden;page-break-after:always;padding:5mm 9mm}
      .page:last-child{page-break-after:auto}
      @media screen{
        html,body{background:#d9dce1}
        body{padding:10px 0}
        .page{width:210mm;height:297mm;margin:0 auto 14px;background:#fff;box-shadow:0 6px 28px rgba(0,0,0,.22);padding:10mm 12mm;page-break-after:auto}
      }
      header{border-bottom:3px solid #F500A0;padding-bottom:3mm;margin-bottom:4mm}
      .brand{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;padding-bottom:3mm;border-bottom:1px solid #ddd}
      .shop{font-size:20px;font-weight:900;letter-spacing:.01em;text-transform:uppercase;line-height:1.15}
      .addr{font-size:11.5px;color:#444;margin-top:1mm;max-width:118mm;line-height:1.35}.addr.strong{color:#111;font-weight:700}
      .tagwrap{text-align:right;flex-shrink:0}
      .tag{display:inline-block;background:#FCE7F3;border:1px solid #F9A8D4;color:#F500A0;font-weight:900;font-size:11px;letter-spacing:.08em;padding:1.2mm 3mm;border-radius:2mm}
      .no{font-size:15px;font-weight:800;font-family:"Courier New",monospace;margin-top:2mm}
      .sub{font-size:12px;color:#444;margin-top:1mm}
      .billed{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;padding-top:3mm}
      .supply{text-align:right}.pos{font-size:14px;font-weight:800;margin-top:1mm}
      .lbl{font-size:10px;font-weight:800;color:#64748b;letter-spacing:.1em;text-transform:uppercase}
      .cust{font-size:22px;font-weight:800;line-height:1.15;margin-top:1mm}
      .item{border:2px solid #222;border-radius:3mm;padding:3mm 4mm;margin-bottom:4mm}
      .row{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm}
      .name{font-size:22px;font-weight:800}.cnt{font-size:13px;font-weight:600;color:#555}
      .price{text-align:right;font-size:18px;font-weight:700}.due{font-size:13px;font-weight:600;color:#B45309}
      .info{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-top:3mm}
      .cell{border:1px solid #bbb;border-radius:2mm;padding:2mm 3mm}
      .cell span{display:block;font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.05em}
      .cell b{display:block;font-size:15px;margin-top:.5mm}
      .h{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#F500A0;margin:1mm 0 2.5mm}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-bottom:4mm}
      .m{border:2px solid #222;border-radius:3mm;padding:3mm 5mm;min-height:21mm;display:flex;flex-direction:column;justify-content:space-between}
      .m span{font-size:12px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:.04em}
      .m b{font-size:28px;font-weight:800;line-height:1.1}.m i{font-size:14px;font-style:normal;font-weight:600;color:#444}
      .none{font-size:14px;color:#777;margin-bottom:4mm}
      .remarks{padding:0 0 0 1mm;min-height:14mm;font-size:15px;margin-bottom:3mm}
      .remarks ol{margin:0;padding-left:6mm}.remarks li{margin-bottom:1mm}
      .notes{flex:1;min-height:6mm}
      .signrow{display:flex;justify-content:flex-end;margin-top:3mm}
      .sign{width:62mm;text-align:center}
      .sigline{border-top:1.5px solid #111;margin-top:11mm}
      .siglabel{font-size:12.5px;font-weight:800;margin-top:1.5mm}
      .sigshop{font-size:10.5px;color:#555;margin-top:.5mm}
      .foot{text-align:center;font-size:9.5px;color:#888;border-top:1px solid #e5e5e5;margin-top:4mm;padding-top:2mm}
    </style></head><body>${body}</body></html>`;
    if (prefs.size === "a5") {
      // A5 = the A4 design scaled down to fit
      html = html.replace("@page { size: A4 portrait; margin: 6mm; }", "@page { size: A5 portrait; margin: 4mm; } @media print{html{zoom:.69}}");
    }
    return {
      html,
      title: list.length === 1 ? `#${list[0].invoice_no}` : `${list.length} bills`,
    };
  };

  // Preview: opens the preview window (Print is inside it)
  const openPreview = (list: MeasurementOrder[]) => {
    const d = buildPrintDoc(list);
    if (d) setPreview({ ...d, list });
  };

  // Print: straight to the print dialog, no preview step
  const printNow = (list: MeasurementOrder[], prefs?: PrintPrefs) => {
    const d = buildPrintDoc(list, prefs);
    if (!d) return;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    f.srcdoc = d.html;
    f.onload = () => {
      setTimeout(() => {
        f.contentWindow?.focus();
        f.contentWindow?.print();
        setTimeout(() => f.remove(), 60_000);
      }, 300);
    };
    document.body.appendChild(f);
  };

  // Print from inside the preview: ask for printer type / paper size first
  const printFromPreview = () => {
    if (preview) setPrintDialog({ list: preview.list, fromPreview: true });
  };

  const confirmPrint = (prefs: PrintPrefs) => {
    const pd = printDialog;
    setPrintDialog(null);
    if (!pd) return;
    if (pd.fromPreview) {
      // show the sheet the way it will print, then print it
      const d = buildPrintDoc(pd.list, prefs);
      if (!d) return;
      setPreview({ ...d, list: pd.list });
      setTimeout(() => {
        const w = previewFrame.current?.contentWindow;
        w?.focus();
        w?.print();
      }, 900);
    } else {
      printNow(pd.list, prefs);
    }
  };

  const openPreviewFullPage = () => {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([preview.html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-5">
      {/* Print preview (same look as the invoice preview) */}
      {preview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[400] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden border border-neutral-300">
            <div className="px-4 py-3 flex justify-between items-center bg-neutral-900 text-white border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F500A0]" />
                <h3 className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <span>Measurement Preview</span>
                  <span className="text-neutral-400 font-mono">{preview.title}</span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={printFromPreview}
                  className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 bg-[#F500A0] hover:bg-[#D8008D] rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={openPreviewFullPage}
                  className="text-xs font-semibold text-neutral-300 hover:text-white px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Full Page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
                  aria-label="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe ref={previewFrame} title="Measurement preview" srcDoc={preview.html} className="flex-1 w-full bg-[#d9dce1] border-0" />
          </div>
        </div>
      )}

      <PrintOptionsDialog open={Boolean(printDialog)} onClose={() => setPrintDialog(null)} onConfirm={confirmPrint} />

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
            onClick={() => openPreview(visible)}
            disabled={visible.length === 0}
            className="text-xs font-black uppercase tracking-wider border-2 border-black/15 text-black bg-white hover:border-[#F500A0] hover:text-[#F500A0] disabled:opacity-40 px-5 py-2.5 rounded-full flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button
            onClick={() => setPrintDialog({ list: visible, fromPreview: false })}
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
                  <button
                    onClick={() => openPreview([r])}
                    className="p-2.5 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
                    title="Preview"
                    aria-label="Preview"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPrintDialog({ list: [r], fromPreview: false })}
                    className="p-2.5 rounded-lg bg-pink-50 text-[#F500A0] hover:bg-pink-100 transition-colors cursor-pointer"
                    title="Print"
                    aria-label="Print"
                  >
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
