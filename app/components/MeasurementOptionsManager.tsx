"use client";

import React, { useEffect, useState } from "react";
import { Plus, X, Loader2, Pencil, Check } from "lucide-react";
import NeckTypeIcon from "./NeckTypeIcon";
import {
  fetchMeasurementOptions,
  createMeasurementOption,
  renameMeasurementOption,
  removeMeasurementOption,
} from "@/app/pos/actions";
import { OPTION_KINDS, unwrap, type MeasurementOption, type OptionKind } from "@/lib/measurements";
import { toast } from "@/lib/toast";

/** Add, rename and remove every neck type, sleeve type and sleeve length offered in the measurement form. */
export default function MeasurementOptionsManager({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<MeasurementOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    fetchMeasurementOptions()
      .then((r) => setOptions(unwrap(r)))
      .catch((e) => setLoadError((e as Error)?.message || "Failed to load options"))
      .finally(() => setLoading(false));
  }, []);

  const add = async (kind: OptionKind) => {
    const name = (drafts[kind] || "").trim();
    if (!name) return;
    setBusy(kind);
    try {
      const created = unwrap(await createMeasurementOption(kind, name));
      setOptions((o) => [...o, created]);
      setDrafts((d) => ({ ...d, [kind]: "" }));
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
    setBusy(o.id);
    try {
      const updated = unwrap(await renameMeasurementOption(o.id, name));
      setOptions((list) => list.map((x) => (x.id === o.id ? updated : x)));
      setEditingId(null);
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to rename option");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (o: MeasurementOption) => {
    if (!window.confirm(`Remove "${o.name}"? Saved measurements that already use it keep their value.`)) return;
    try {
      unwrap(await removeMeasurementOption(o.id));
      setOptions((list) => list.filter((x) => x.id !== o.id));
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to remove option");
    }
  };

  return (
    <div className="bg-white border border-[#F500A0]/30 rounded-2xl shadow-sm p-4 sm:p-5 space-y-5">
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {OPTION_KINDS.map(({ kind, title }) => {
              const list = options.filter((o) => o.kind === kind);
              return (
                <div key={kind} className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-wider text-[#F500A0]">{title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.length === 0 && <span className="text-[11px] font-semibold text-black/40">None - add one below.</span>}
                    {list.map((o) =>
                      editingId === o.id ? (
                        <form
                          key={o.id}
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveEdit(o);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                            className="w-32 bg-white border border-[#F500A0] rounded-full px-3 py-1 text-[11px] font-bold focus:outline-none"
                          />
                          <button type="submit" disabled={busy === o.id} className="p-1 rounded-full bg-[#F500A0] text-white cursor-pointer" aria-label="Save">
                            {busy === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className="p-1 rounded-full border border-black/10 cursor-pointer" aria-label="Cancel">
                            <X className="w-3 h-3" />
                          </button>
                        </form>
                      ) : (
                        <span
                          key={o.id}
                          className="pl-2.5 pr-1 py-1 rounded-full bg-[#F500A0]/10 border border-[#F500A0]/30 text-[11px] font-bold text-[#F500A0] flex items-center gap-1"
                        >
                          {kind === "neck" && <NeckTypeIcon type={o.name} className="w-4 h-3" />}
                          {o.name}
                          <button onClick={() => startEdit(o)} className="p-0.5 rounded-full hover:bg-[#F500A0]/20 cursor-pointer" aria-label={`Rename ${o.name}`}>
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => remove(o)} className="p-0.5 rounded-full hover:bg-[#F500A0]/20 cursor-pointer" aria-label={`Remove ${o.name}`}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ),
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      add(kind);
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={drafts[kind] || ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [kind]: e.target.value }))}
                      placeholder={`Add ${title.toLowerCase().replace(/s$/, "")}`}
                      className="flex-1 min-w-0 bg-white border border-black/10 focus:border-[#F500A0] rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busy === kind || !(drafts[kind] || "").trim()}
                      className="bg-[#F500A0] disabled:opacity-50 text-white px-3 rounded-lg flex items-center cursor-pointer"
                      aria-label={`Add ${title}`}
                    >
                      {busy === kind ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
