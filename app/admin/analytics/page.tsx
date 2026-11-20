"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart2,
  TrendingUp,
  ShoppingBag,
  IndianRupee,
  Trophy,
  Calendar,
  Globe,
  RefreshCw,
  Percent,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { BRAND_EN } from "@/lib/brand";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx";
import { summarizeCashflow, dedupeAdvance } from "@/lib/paymentSplit";

export const dynamic = "force-dynamic";

type PeriodKey = "all" | "today" | "week" | "month" | "year";

interface SaleRecord {
  id: string;
  total?: number;
  grand_total?: number;
  subtotal?: number;
  gst_amount?: number;
  is_gst?: boolean;
  delivery_fee?: number;
  created_at: string;
  status: string;
  is_advance?: boolean | null;
  payment_mode?: string;
  payment_method?: string;
  is_credit?: boolean;
  credit_status?: string | null;
  balance_due?: number;
  source?: string;
  [key: string]: any;
}

export default function AdminAnalyticsPage() {
  const [salesData, setSalesData] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [itemsData, setItemsData] = useState<any[]>([]);

  const formatINR = (val: number) =>
    Number(val || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const loadSalesData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Analytics = status = COMPLETED (and nothing else)
      // Completed sales, plus credit and advance rows so unpaid credit / advance deposits
      // can be shown. Older databases without these columns fall back to completed-only.
      let res: any = await supabase
        .from("orders")
        .select("*")
        .or("status.eq.COMPLETED,is_credit.eq.true,is_advance.eq.true,order_type.eq.ADVANCE");
      if (res.error) {
        res = await supabase.from("orders").select("*").eq("status", "COMPLETED");
      }
      const { data: sales, error } = res;

      if (error) {
        console.error("[Analytics] Error loading sales data:", error);
        return;
      }
      setSalesData(sales || []);

      // Line items for the product-wise Excel export (chunked to keep URLs short)
      const ids = (sales || []).filter((s: any) => String(s.status || "").toUpperCase() === "COMPLETED").map((s: any) => s.id);
      const all: any[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data: its } = await supabase
          .from("order_items")
          .select("*")
          .in("order_id", ids.slice(i, i + 100));
        if (its) all.push(...its);
      }
      setItemsData(all);
    } catch (err) {
      console.error("[Analytics] Error loading sales data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSalesData();

    const handleFocus = () => loadSalesData(true);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadSalesData]);

  // Filter completed sales by selected period
  const inPeriod = (sale: SaleRecord) => {
    if (period === "all") return true;

    const d = new Date(sale.created_at);
    if (isNaN(d.getTime())) return false;
    const now = new Date();

    if (period === "today") {
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    }
    if (period === "week") {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
      startOfWeek.setHours(0, 0, 0, 0);
      return d >= startOfWeek;
    }
    if (period === "month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (period === "year") {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  };

  // A completed advance also has its own final-invoice row: count the sale once.
  const dedupedData = dedupeAdvance(salesData);
  const filteredSales = dedupedData.filter(
    (sale) => (sale.status || "").toUpperCase() === "COMPLETED" && inPeriod(sale),
  );

  // Helper to extract realized revenue from completed sales & advance orders
  const getSaleAmount = (s: SaleRecord) =>
    Number(s.grand_total ?? s.total ?? (s as any).total_amount ?? (s as any).amount_paid ?? 0);

  // Calculate clean core metrics (strictly completed sales)
  const totalRevenue = filteredSales.reduce(
    (sum, s) => sum + getSaleAmount(s),
    0
  );
  const totalOrders = filteredSales.length;
  const avgBillValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Breakdown metrics
  const offlineSales = filteredSales.filter((s) => s.source !== "ONLINE");
  const onlineSales = filteredSales.filter((s) => s.source === "ONLINE");
  const offlineRevenue = offlineSales.reduce(
    (sum, s) => sum + getSaleAmount(s),
    0
  );
  const onlineRevenue = onlineSales.reduce(
    (sum, s) => sum + getSaleAmount(s),
    0
  );

  const gstSales = filteredSales.filter((s) => Boolean(s.is_gst));
  const nonGstSales = filteredSales.filter((s) => !Boolean(s.is_gst));
  const gstRevenue = gstSales.reduce(
    (sum, s) => sum + getSaleAmount(s),
    0
  );
  const nonGstRevenue = nonGstSales.reduce(
    (sum, s) => sum + getSaleAmount(s),
    0
  );

  // Cash / GPay / Card received (split bills are divided between the modes)
  const pay = summarizeCashflow(dedupedData.filter(inPeriod));

  // Monthly revenue trend (current year)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentYear = new Date().getFullYear();
  const monthlyRevenue = Array(12).fill(0);
  dedupedData.forEach((s) => {
    if (s.status === "COMPLETED") {
      const d = new Date(s.created_at);
      if (d.getFullYear() === currentYear) {
        monthlyRevenue[d.getMonth()] += getSaleAmount(s);
      }
    }
  });
  const maxMonthlyRevenue = Math.max(...monthlyRevenue, 1);

  // Product-wise Excel: two sheets' worth of data in one - summary per product,
  // then every sold line. `scope` = current period filter, or all completed sales.
  const exportProductsExcel = (scope: "filtered" | "all") => {
    const sales = scope === "filtered" ? filteredSales : salesData;
    const byId = new Map(sales.map((s) => [s.id, s]));
    const lines = itemsData.filter((it) => byId.has(it.order_id));
    if (lines.length === 0) {
      alert("No product sales to export");
      return;
    }
    const summary = new Map<string, { qty: number; revenue: number; bills: Set<string> }>();
    lines.forEach((it) => {
      const name = it.snapshot_name || it.name || "Unknown";
      const qty = Number(it.quantity ?? 1) || 1;
      const rev = qty * (Number(it.snapshot_price ?? it.price ?? 0) || 0);
      const e = summary.get(name) || { qty: 0, revenue: 0, bills: new Set<string>() };
      e.qty += qty;
      e.revenue += rev;
      e.bills.add(it.order_id);
      summary.set(name, e);
    });
    const rows: XlsxCell[][] = [...summary.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, e], i) => [i + 1, name, e.qty, e.bills.size, Math.round(e.revenue * 100) / 100]);
    const totalQty = rows.reduce((s, r) => s + (r[2] as number), 0);
    const totalRev = rows.reduce((s, r) => s + (r[4] as number), 0);
    rows.push(["", "TOTAL", totalQty, "", Math.round(totalRev * 100) / 100]);
    rows.push([]);
    rows.push(["", "Bill-wise product lines"]);
    rows.push(["#", "Product", "Qty", "Bill ID", "Amount (₹)", "Date"]);
    lines.forEach((it, i) => {
      const o: any = byId.get(it.order_id);
      const qty = Number(it.quantity ?? 1) || 1;
      rows.push([
        i + 1,
        it.snapshot_name || it.name || "Unknown",
        qty,
        o?.invoice_no || it.order_id,
        Math.round(qty * (Number(it.snapshot_price ?? it.price ?? 0) || 0) * 100) / 100,
        o?.created_at ? new Date(o.created_at).toLocaleDateString("en-IN") : "",
      ]);
    });
    const blob = buildXlsx({
      sheetName: "Products",
      headers: ["#", "Product", "Qty Sold", "No. of Bills", "Revenue (₹)", "Date"],
      rows,
      widths: [6, 36, 12, 22, 16, 14],
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `product-sales-${scope === "filtered" ? period : "all"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#FFF0F8] text-[#111111] font-sans p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-[#F500A0]/20 shadow-xs">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/pos/admin/secure/control-panel/hm-boutique"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#F500A0] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to POS Control Panel
              </Link>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-950 tracking-tight flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-[#F500A0]" />
              {BRAND_EN} — Realized Sales Analytics
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Revenue counts finalized sales only. The payment boxes show money actually received: split bills divided into Cash and GPay, credit once paid, and advance deposits.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadSalesData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => exportProductsExcel("filtered")}
              className="px-3 py-2 bg-white hover:bg-[#F500A0]/5 text-[#F500A0] text-xs font-bold rounded-xl border border-[#F500A0] cursor-pointer"
            >
              Products Excel (Filtered)
            </button>
            <button
              onClick={() => exportProductsExcel("all")}
              className="px-3 py-2 bg-white hover:bg-[#F500A0]/5 text-[#F500A0] text-xs font-bold rounded-xl border border-[#F500A0] cursor-pointer"
            >
              Products Excel (All)
            </button>
            <Link
              href="/admin/orders"
              className="px-3.5 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              Order History
            </Link>
            <Link
              href="/admin/advance-orders"
              className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl border border-amber-200 shadow-xs transition-colors"
            >
              Advance Orders
            </Link>
            <Link
              href="/admin/outstanding-credits"
              className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold rounded-xl border border-blue-200 shadow-xs transition-colors"
            >
              Outstanding Credits
            </Link>
          </div>
        </div>

        {/* Period Selector */}
        <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-200 shadow-xs flex-wrap gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">
            Period Filter:
          </span>
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {(["all", "today", "week", "month", "year"] as PeriodKey[]).map((p) => {
              const label =
                p === "all"
                  ? "All Time"
                  : p === "today"
                  ? "Today"
                  : p === "week"
                  ? "This Week"
                  : p === "month"
                  ? "This Month"
                  : "This Year";
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    period === p
                      ? "bg-[#F500A0] text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Core Metric Cards Grid (Clean 3-Column Rebalanced Layout) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Sales / Revenue */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Total Realized Revenue
              </span>
              <div className="w-8 h-8 rounded-xl bg-pink-50 flex items-center justify-center text-[#F500A0]">
                <IndianRupee className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-gray-950 font-mono tracking-tight">
                ₹{formatINR(totalRevenue)}
              </div>
              <div className="text-[11px] text-gray-400 mt-1 font-medium">
                GST: ₹{formatINR(gstRevenue)} • Non-GST: ₹{formatINR(nonGstRevenue)}
              </div>
            </div>
          </div>

          {/* Total Orders */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Total Completed Orders
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-gray-950 tracking-tight">
                {totalOrders}
              </div>
              <div className="text-[11px] text-gray-400 mt-1 font-medium">
                Standard POS bills + completed advance orders
              </div>
            </div>
          </div>

          {/* Average Bill Value */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Average Bill Value
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-gray-950 font-mono tracking-tight">
                ₹{formatINR(avgBillValue)}
              </div>
              <div className="text-[11px] text-gray-400 mt-1 font-medium">
                Per realized customer transaction
              </div>
            </div>
          </div>
        </div>

        {/* Money received by payment mode. Split bills are divided into Cash and GPay;
            credit counts once it is paid; advance deposits count while the order is pending. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Cash", amount: pay.cash, note: `${pay.cashBills} bill${pay.cashBills === 1 ? "" : "s"}`, cls: "bg-emerald-50 text-emerald-600" },
            { label: "GPay / UPI", amount: pay.gpay, note: `${pay.gpayBills} bill${pay.gpayBills === 1 ? "" : "s"}`, cls: "bg-blue-50 text-blue-600" },
            {
              label: "Split",
              amount: pay.splitAmount,
              note: `${pay.splitBills} bill${pay.splitBills === 1 ? "" : "s"} · Cash ₹${formatINR(pay.splitCash)} + GPay ₹${formatINR(pay.splitGpay)}`,
              cls: "bg-pink-50 text-[#F500A0]",
            },
            { label: "Card", amount: pay.card, note: `${pay.cardBills} bill${pay.cardBills === 1 ? "" : "s"}`, cls: "bg-violet-50 text-violet-600" },
          ].map((b) => (
            <div key={b.label} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{b.label} Received</span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${b.cls}`}>
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-gray-950 font-mono tracking-tight">₹{formatINR(b.amount)}</div>
                <div className="text-[11px] text-gray-400 mt-1 font-medium">{b.note}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 -mt-2 px-1">
          Split bills are already included in the Cash and GPay boxes above (the Split box shows how much of them came from split payments).
        </p>

        {/* Credit and Advance orders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-xs">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Credit Sales</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <IndianRupee className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 font-mono tracking-tight">₹{formatINR(pay.credit.outstanding)}</div>
            <div className="text-[11px] text-gray-500 mt-1 font-medium">
              Outstanding · {pay.credit.outstandingBills} unpaid bill{pay.credit.outstandingBills === 1 ? "" : "s"}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs">
              <span className="text-gray-500 font-medium">
                Collected ({pay.credit.collectedBills} bill{pay.credit.collectedBills === 1 ? "" : "s"})
              </span>
              <span className="font-black text-emerald-600 font-mono">₹{formatINR(pay.credit.collected)}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Collected credit is included in Cash / GPay by how it was paid.</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Advance Orders</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <IndianRupee className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-700 font-mono tracking-tight">₹{formatINR(pay.advance.pending)}</div>
            <div className="text-[11px] text-gray-500 mt-1 font-medium">
              Balance pending · {pay.advance.pendingBills} open order{pay.advance.pendingBills === 1 ? "" : "s"}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs">
              <span className="text-gray-500 font-medium">
                Deposits received ({pay.advance.depositBills} order{pay.advance.depositBills === 1 ? "" : "s"})
              </span>
              <span className="font-black text-emerald-600 font-mono">₹{formatINR(pay.advance.deposits)}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Deposits are in Cash / GPay above; not counted as revenue until the order is completed.</p>
          </div>
        </div>

        {/* Secondary Sales Distribution Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Channel Sales (Offline vs Online) */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-blue-600" /> Channel Sales Performance
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-500 uppercase">Walk-in / POS</p>
                <p className="text-base font-black text-gray-900 font-mono mt-0.5">
                  ₹{formatINR(offlineRevenue)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{offlineSales.length} orders</p>
              </div>
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-500 uppercase">Online Channel</p>
                <p className="text-base font-black text-gray-900 font-mono mt-0.5">
                  ₹{formatINR(onlineRevenue)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{onlineSales.length} orders</p>
              </div>
            </div>
          </div>

          {/* Tax Breakdown (GST vs Non-GST) */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <Percent className="w-4 h-4 text-[#F500A0]" /> Tax &amp; Bill Classification
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-500 uppercase">GST Tax Invoices</p>
                <p className="text-base font-black text-gray-900 font-mono mt-0.5">
                  ₹{formatINR(gstRevenue)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{gstSales.length} invoices</p>
              </div>
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-500 uppercase">Non-GST Bills</p>
                <p className="text-base font-black text-gray-900 font-mono mt-0.5">
                  ₹{formatINR(nonGstRevenue)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{nonGstSales.length} bills</p>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Revenue Trend Chart */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Monthly Realized Revenue — {currentYear}
              </h3>
              <p className="text-xs text-gray-500">
                Sum of finalized customer billing per calendar month
              </p>
            </div>
            <span className="text-xs font-black text-[#F500A0] font-mono">
              Peak: ₹{formatINR(maxMonthlyRevenue)}
            </span>
          </div>

          <div className="h-48 flex items-end justify-between gap-2 pt-8 border-b border-gray-100 pb-2">
            {months.map((m, idx) => {
              const rev = monthlyRevenue[idx];
              const pct = maxMonthlyRevenue > 0 ? (rev / maxMonthlyRevenue) * 100 : 0;
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <span className="text-[9px] font-bold text-[#F500A0] opacity-0 group-hover:opacity-100 transition-opacity">
                    {rev > 0 ? `₹${Math.round(rev / 1000)}k` : ""}
                  </span>
                  <div
                    style={{ height: `${Math.max(pct, 4)}%` }}
                    className={`w-full rounded-t-md transition-all ${
                      rev > 0 ? "bg-[#F500A0] group-hover:brightness-90" : "bg-gray-100"
                    }`}
                  />
                  <span className="text-[10px] font-semibold text-gray-400 group-hover:text-gray-900">
                    {m}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 text-center text-[10px] text-gray-400">
          Powered by Cenexa Systems © 2026
        </div>
      </div>
    </div>
  );
}
