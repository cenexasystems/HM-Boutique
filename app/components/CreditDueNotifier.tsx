"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "@/lib/toast";

/**
 * In-app credit due-date reminders (renders nothing).
 *
 * While the POS/admin is open it checks unsettled credit bills every 30 minutes and
 * on tab focus. A bill whose due date is today (or already past) triggers one toast +
 * browser notification per bill, per due date, per day. Changing a bill's due date
 * changes the reminder key, so the new date is reminded again on that day.
 *
 * Note: this only fires while the app is open in a browser. A reminder to the customer
 * (or when nobody has the app open) needs a server job + WhatsApp/SMS provider.
 */
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const seen = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const markSeen = (key: string) => {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
};

export default function CreditDueNotifier() {
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, invoice_no, customer_name, total, balance_due, status, credit_status, due_date, credit_due_date")
          .or("payment_method.eq.CREDIT,is_credit.eq.true")
          .neq("status", "COMPLETED");
        if (error || !data || cancelled) return;

        const today = todayYmd();
        for (const o of data as any[]) {
          if (String(o.credit_status || "").toLowerCase() === "paid") continue;
          // Either column may be stale; the most recently saved one is credit_due_date.
          const due = String(o.credit_due_date || o.due_date || "").slice(0, 10);
          if (!due || due > today) continue;

          const key = `credit-due:${o.id}:${due}:${today}`;
          if (seen(key)) continue;
          markSeen(key);

          const amt = Number(o.balance_due ?? o.total ?? 0);
          const overdue = due < today;
          const msg = `${overdue ? "Overdue" : "Due today"}: ${o.customer_name || "Customer"} · #${o.invoice_no || o.id} · ₹${amt.toLocaleString("en-IN")}`;
          toast.info(msg);
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(overdue ? "Credit payment overdue" : "Credit payment due today", { body: msg });
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* non-fatal */
      }
    };

    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* ignore */
    }

    void check();
    const timer = window.setInterval(check, 30 * 60 * 1000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
