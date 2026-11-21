"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, Pencil, Trash2, Check, Tag, RotateCcw, AlertTriangle } from "lucide-react";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/expenseCategories";

export interface CategoryUsage {
  count: number;
  total: number;
}

export interface CategoryChanges {
  /** final list of category names */
  list: string[];
  /** brand-new categories */
  adds: string[];
  /** old name -> new name (the category is renamed everywhere) */
  renames: Record<string, string>;
  /** every removed category (original name) */
  deletes: string[];
  /** removed category that still has expenses -> category those expenses move to */
  moves: Record<string, string>;
}

interface Row {
  id: number;
  original: string | null; // null for newly added
  name: string;
}

interface Props {
  open: boolean;
  categories: string[];
  usage: Record<string, CategoryUsage>;
  saving?: boolean;
  onClose: () => void;
  onSave: (changes: CategoryChanges) => void | Promise<void>;
}

const inr = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const PALETTE = ["#F500A0", "#10B981", "#3E6F8E", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#84CC16", "#EC4899", "#64748B"];

export default function ExpenseCategoryManager({ open, categories, usage, saving, onClose, onSave }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [removed, setRemoved] = useState<Row[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(categories.map((c, i) => ({ id: i + 1, original: c, name: c })));
    setRemoved([]);
    setNewName("");
    setEditingId(null);
    setConfirmId(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nextId = useMemo(() => Math.max(0, ...rows.map((r) => r.id), ...removed.map((r) => r.id)) + 1, [rows, removed]);
  const used = (r: Row) => (r.original ? usage[r.original] : undefined) || { count: 0, total: 0 };
  const exists = (name: string, exceptId?: number) =>
    rows.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === name.trim().toLowerCase());

  if (!open) return null;

  const add = () => {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (exists(name)) {
      setError(`"${name}" is already in the list.`);
      return;
    }
    setError(null);
    setRows((rs) => [...rs, { id: nextId, original: null, name }]);
    setNewName("");
  };

  const commitRename = (r: Row) => {
    const name = editValue.trim().replace(/\s+/g, " ");
    if (!name) {
      setEditingId(null);
      return;
    }
    if (exists(name, r.id)) {
      setError(`"${name}" is already in the list.`);
      return;
    }
    setError(null);
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, name } : x)));
    setEditingId(null);
  };

  const askDelete = (r: Row) => {
    if (used(r).count === 0) {
      setRows((rs) => rs.filter((x) => x.id !== r.id));
      if (r.original) setRemoved((rm) => [...rm, r]);
      return;
    }
    const fallback = rows.find((x) => x.id !== r.id && /misc/i.test(x.name)) || rows.find((x) => x.id !== r.id);
    setMoveTo(fallback ? fallback.name : "");
    setConfirmId(r.id);
  };

  const confirmDelete = (r: Row) => {
    if (!moveTo) {
      setError("Choose a category to move the expenses to.");
      return;
    }
    setError(null);
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    setRemoved((rm) => [...rm, { ...r, name: moveTo }]); // name holds the move target for removed rows
    setConfirmId(null);
  };

  const resetDefaults = () => {
    // standard categories that were removed come back; categories with expenses are never dropped
    const have = new Set(rows.map((r) => r.name.toLowerCase()));
    const missing = DEFAULT_EXPENSE_CATEGORIES.filter((d) => !have.has(d.toLowerCase()));
    setRows((rs) => [...rs, ...missing.map((n, i) => ({ id: nextId + i, original: null, name: n }))]);
    setError(null);
  };

  const save = () => {
    const renames: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.original && r.original !== r.name) renames[r.original] = r.name;
    });
    const deletes: string[] = [];
    const moves: Record<string, string> = {};
    removed.forEach((r) => {
      if (!r.original) return;
      deletes.push(r.original);
      if (usage[r.original]?.count) moves[r.original] = r.name; // removed rows keep the move target in `name`
    });
    const adds = rows.filter((r) => !r.original).map((r) => r.name);
    void onSave({ list: rows.map((r) => r.name), adds, renames, deletes, moves });
  };

  const dirty =
    removed.length > 0 ||
    rows.some((r) => r.original === null || r.original !== r.name);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 bg-black/55 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-black/10 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F500A0]/10 flex items-center justify-center">
              <Tag className="w-5 h-5 text-[#F500A0]" />
            </div>
            <div>
              <h3 className="text-lg font-black text-black tracking-tight leading-tight">Manage Categories</h3>
              <p className="text-[11px] font-semibold text-black/55 mt-0.5">Add, rename or remove expense categories</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-black/5 flex items-center justify-center cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add new */}
        <div className="px-5 pt-4">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="New category name, e.g. Festival decorations"
              className="flex-1 bg-[#FAFAFA] border border-black/10 focus:border-[#F500A0] rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none"
            />
            <button
              onClick={add}
              disabled={!newName.trim()}
              className="px-4 rounded-xl bg-[#F500A0] hover:bg-[#D8008D] disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          {error && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-rose-600">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </div>
          )}
        </div>

        {/* List */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-2">
          {rows.length === 0 && (
            <div className="text-center text-sm font-semibold text-black/50 py-8">No categories yet. Add one above.</div>
          )}
          {rows.map((r, i) => {
            const u = used(r);
            const isEditing = editingId === r.id;
            const renamed = r.original && r.original !== r.name;
            return (
              <div key={r.id} className="rounded-xl border border-black/10 bg-white">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-2.5 h-9 rounded-full shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(r);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full bg-[#FAFAFA] border border-[#F500A0] rounded-lg px-2.5 py-1.5 text-sm font-bold focus:outline-none"
                      />
                    ) : (
                      <>
                        <div className="text-sm font-black text-black truncate">{r.name}</div>
                        <div className="text-[11px] font-semibold text-black/50 truncate">
                          {u.count > 0 ? `${u.count} expense${u.count === 1 ? "" : "s"} · ${inr(u.total)}` : r.original ? "No expenses yet" : "New category"}
                          {renamed && <span className="text-[#F500A0]"> · was “{r.original}”</span>}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {isEditing ? (
                      <button onClick={() => commitRename(r)} className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 cursor-pointer" aria-label="Save name">
                        <Check className="w-4 h-4" />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(r.id);
                            setEditValue(r.name);
                            setError(null);
                          }}
                          className="p-2 rounded-lg hover:bg-black/5 cursor-pointer"
                          aria-label="Rename"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => askDelete(r)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {confirmId === r.id && (
                  <div className="border-t border-amber-200 bg-amber-50 px-3 py-3 rounded-b-xl space-y-2">
                    <p className="text-xs font-bold text-amber-900">
                      {u.count} expense{u.count === 1 ? " uses" : "s use"} “{r.name}”. Move {u.count === 1 ? "it" : "them"} to:
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={moveTo}
                        onChange={(e) => setMoveTo(e.target.value)}
                        className="flex-1 bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:outline-none"
                      >
                        {rows
                          .filter((x) => x.id !== r.id)
                          .map((x) => (
                            <option key={x.id} value={x.name}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                      <button onClick={() => confirmDelete(r)} className="px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer">
                        Delete
                      </button>
                      <button onClick={() => setConfirmId(null)} className="px-3 rounded-lg border border-black/15 text-xs font-bold cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-black/10 bg-[#FAFAFA] flex items-center justify-between gap-3">
          <button onClick={resetDefaults} className="text-[11px] font-bold text-black/60 hover:text-black flex items-center gap-1.5 cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" /> Reset to standard list
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-black/15 text-xs font-bold hover:bg-black/5 cursor-pointer">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-5 py-2.5 rounded-xl bg-[#F500A0] hover:bg-[#D8008D] disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
