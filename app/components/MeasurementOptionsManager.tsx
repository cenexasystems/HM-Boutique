"use client";

import React, { useEffect, useRef, useState } from "react";
import { Plus, X, Loader2, Pencil, Check, Trash2, Search, Undo2 } from "lucide-react";
import NeckTypeIcon from "./NeckTypeIcon";
import {
  fetchMeasurementOptions,
  createMeasurementOption,
  renameMeasurementOption,
  removeMeasurementOption,
} from "@/app/pos/actions";
import { OPTION_KINDS, unwrap, type MeasurementOption, type OptionKind } from "@/lib/measurements";
import { toast } from "@/lib/toast";

const UNDO_MS = 5000;

/** Add, rename and remove every neck type, sleeve type and sleeve length offered in the measurement form. */
export default function MeasurementOptionsManager({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<MeasurementOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<OptionKind>(OPTION_KINDS[0].kind);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // Deletes are deferred so they can be undone; ids here are hidden from the list.
  const [pending, setPending] = useState<MeasurementOption[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    fetchMeasurementOptions()
      .then((r) => setOptions(unwrap(r)))
      .catch((e) => setLoadError((e as Error)?.message || "Failed to load options"))
      .finally(() => setLoading(false));
  }, []);

  // Commit any still-pending deletes if the panel is closed.
  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((timer, id) => {
        clearTimeout(timer);
        removeMeasurementOption(id).catch(() => {});
      });
      t.clear();
    };
  }, []);

  const active = OPTION_KINDS.find((k) => k.kind === kind)!;
  const singular = active.title.toLowerCase().replace(/s$/, "");
  const hidden = new Set(pending.map((p) => p.id));
  const visible = options.filter((o) => !hidden.has(o.id));
  const list = visible.filter((o) => o.kind === kind);
  const shown = list.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase()));

  const switchTab = (k: OptionKind) => {
    setKind(k);
    setSearch("");
    setAdding(false);
    setDraft("");
    setEditingId(null);
  };

  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    if (options.some((o) => o.kind === kind && o.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists`);
      return;
    }
    setBusy("add");
    try {
      const created = unwrap(await createMeasurementOption(kind, name));
      setOptions((o) => [...o, created]);
      setDraft("");
      setAdding(false);
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to add option");
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (o: MeasurementOption) => {
    setEditingId(o.id);
    setEditValue(o.name);
  };

  const saveEdit = async (o: MeasurementOption) => {
    const name = editValue.trim();
    if (!name || name === o.name) {
      setEditingId(null);
      return;
    }
    if (options.some((x) => x.id !== o.id && x.kind === o.kind && x.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists`);
      return;
    }
    setBusy(o.id);
    try {
      const updated = unwrap(await renameMeasurementOption(o.id, name));
      setOptions((l) => l.map((x) => (x.id === o.id ? updated : x)));
      setEditingId(null);
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to rename option");
    } finally {
      setBusy(null);
    }
  };

  const remove = (o: MeasurementOption) => {
    setPending((p) => [...p, o]);
    const timer = setTimeout(async () => {
      timers.current.delete(o.id);
      try {
        unwrap(await removeMeasurementOption(o.id));
        setOptions((l) => l.filter((x) => x.id !== o.id));
        setPending((p) => p.filter((x) => x.id !== o.id));
      } catch (e) {
        setPending((p) => p.filter((x) => x.id !== o.id));
        toast.error((e as Error)?.message || "Failed to remove option");
      }
    }, UNDO_MS);
    timers.current.set(o.id, timer);
  };

  const undo = (o: MeasurementOption) => {
    const timer = timers.current.get(o.id);
    if (timer) clearTimeout(timer);
    timers.current.delete(o.id);
    setPending((p) => p.filter((x) => x.id !== o.id));
  };

  const lastRemoved = pending[pending.length - 1];

  return (
    <div className="bg-white border border-[#F500A0]/30 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-[#000000]">Manage Options</h3>
          <p className="text-[11px] font-semibold text-black/60">
            Add, rename or remove any option. Changes appear in the measurement form in the Billing Panel.
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl px-4 py-3">{loadError}</div>}

      {loading ? (
        <div className="flex justify-center py-6 text-black/50">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        !loadError && (
          <>
            <div className="flex gap-1 overflow-x-auto border-b border-black/10" role="tablist">
              {OPTION_KINDS.map((k) => {
                const count = visible.filter((o) => o.kind === k.kind).length;
                const on = k.kind === kind;
                return (
                  <button
                    key={k.kind}
                    role="tab"
                    aria-selected={on}
                    onClick={() => switchTab(k.kind)}
                    className={`shrink-0 px-3 py-2 text-xs font-black border-b-2 -mb-px cursor-pointer ${
                      on ? "border-[#F500A0] text-[#F500A0]" : "border-transparent text-black/50 hover:text-black"
                    }`}
                  >
                    {k.title}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${on ? "bg-[#F500A0] text-white" : "bg-black/5"}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${active.title.toLowerCase()}...`}
                  className="w-full bg-white border border-black/10 focus:border-[#F500A0] rounded-lg pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none"
                />
              </div>
              <button
                onClick={() => setAdding(true)}
                className="bg-[#F500A0] text-white px-4 py-2 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add {singular}
              </button>
            </div>

            <ul className="divide-y divide-black/5 border border-black/10 rounded-xl overflow-hidden">
              {adding && (
                <li className="bg-[#F500A0]/5">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      add();
                    }}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setDraft(""))}
                      placeholder={`New ${singular} name`}
                      className="flex-1 min-w-0 bg-white border border-[#F500A0] rounded-lg px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busy === "add" || !draft.trim()}
                      className="p-2 rounded-lg bg-[#F500A0] disabled:opacity-50 text-white cursor-pointer"
                      aria-label="Save"
                    >
                      {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => (setAdding(false), setDraft(""))}
                      className="p-2 rounded-lg border border-black/10 cursor-pointer"
                      aria-label="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                </li>
              )}

              {shown.length === 0 && !adding && (
                <li className="px-4 py-6 text-center text-xs font-semibold text-black/40">
                  {list.length === 0 ? `No ${active.title.toLowerCase()} yet. Use "Add ${singular}".` : "No matches."}
                </li>
              )}

              {shown.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-3 min-h-11 hover:bg-black/2">
                  {kind === "neck" && (
                    <span className="w-8 h-8 rounded-full bg-[#F500A0]/10 text-[#F500A0] flex items-center justify-center shrink-0">
                      <NeckTypeIcon type={o.name} className="w-5 h-4" />
                    </span>
                  )}
                  {editingId === o.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveEdit(o);
                      }}
                      className="flex-1 flex items-center gap-2 py-1.5"
                    >
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                        className="flex-1 min-w-0 bg-white border border-[#F500A0] rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none"
                      />
                      <button type="submit" disabled={busy === o.id} className="p-2 rounded-lg bg-[#F500A0] text-white cursor-pointer" aria-label="Save">
                        {busy === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="p-2 rounded-lg border border-black/10 cursor-pointer" aria-label="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button onClick={() => startEdit(o)} className="flex-1 text-left text-xs font-bold text-black py-2.5 cursor-text">
                        {o.name}
                      </button>
                      <button onClick={() => startEdit(o)} className="p-2 rounded-lg hover:bg-black/5 text-black/60 cursor-pointer" aria-label={`Rename ${o.name}`}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(o)} className="p-2 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer" aria-label={`Remove ${o.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>

            {lastRemoved && (
              <div className="flex items-center justify-between gap-3 bg-neutral-900 text-neutral-100 rounded-xl px-4 py-2.5 text-xs font-bold">
                <span>
                  Removed &ldquo;{lastRemoved.name}&rdquo;
                  {pending.length > 1 && ` and ${pending.length - 1} more`}
                </span>
                <button onClick={() => undo(lastRemoved)} className="flex items-center gap-1 text-[#FF7AD0] hover:underline cursor-pointer">
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
              </div>
            )}
            <p className="text-[11px] font-semibold text-black/50">Saved measurements that already use a removed option keep their value.</p>
          </>
        )
      )}
    </div>
  );
}
