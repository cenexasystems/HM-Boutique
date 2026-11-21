// lib/expenseCategories.ts
//
// Expense categories live in the existing `expense_categories` table (id, name). Every expense
// points at one of those rows through `expenses.category_id`, so:
//   - renaming a row renames the category on all of its expenses at once,
//   - deleting a row first needs its expenses moved to another category.
// The standard categories (Rent, Salaries, ...) are only inserted into the table the first time an
// expense uses them, so they are merged in here unless the user has removed them.

import { supabase, isSupabaseConfigured } from './supabase';

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Stock Purchase',
  'Rent',
  'Salaries',
  'Utilities',
  'Electricity',
  'Transport',
  'Marketing',
  'Repairs & Maintenance',
  'Taxes & Fees',
  'Miscellaneous',
];

const HIDDEN_KEY = 'hm_expense_categories_hidden_v1';

const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
const same = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();

const readHidden = (): string[] => {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};
const writeHidden = (list: string[]) => {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
};

/** All category names: rows in the database, plus the standard ones the user has not removed. */
export async function loadExpenseCategories(): Promise<string[]> {
  const hidden = readHidden();
  const names: string[] = [];
  const push = (n: string) => {
    const name = norm(n);
    if (name && !names.some((x) => same(x, name))) names.push(name);
  };

  DEFAULT_EXPENSE_CATEGORIES.filter((d) => !hidden.some((h) => same(h, d))).forEach(push);

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('expense_categories').select('name').order('name', { ascending: true });
      if (!error && Array.isArray(data)) data.forEach((r: any) => push(String(r.name ?? '')));
    } catch {
      /* table not reachable - the standard list is still shown */
    }
  }
  return names;
}

export interface CategoryChangeSet {
  /** categories that did not exist before */
  adds: string[];
  /** old name -> new name */
  renames: Record<string, string>;
  /** every removed category (its original name) */
  deletes: string[];
  /** removed category that still has expenses -> category those expenses move to */
  moves: Record<string, string>;
}

async function findRow(name: string): Promise<{ id: any; name: string } | null> {
  const { data } = await supabase.from('expense_categories').select('id, name').ilike('name', norm(name)).limit(1);
  return data && data.length ? (data[0] as any) : null;
}

async function ensureRow(name: string): Promise<{ id: any; name: string } | null> {
  const existing = await findRow(name);
  if (existing) return existing;
  const { data } = await supabase.from('expense_categories').insert({ name: norm(name) }).select('id, name').maybeSingle();
  return (data as any) || null;
}

/** Applies add / rename / delete to the database. Throws with a readable message on failure. */
export async function applyCategoryChanges(ch: CategoryChangeSet): Promise<void> {
  const hidden = readHidden();

  if (isSupabaseConfigured) {
    // 1) renames: the row is renamed (or merged into an existing category with that name)
    for (const [oldName, newName] of Object.entries(ch.renames)) {
      const row = await findRow(oldName);
      if (!row) continue; // never used yet - nothing stored
      const clash = await findRow(newName);
      if (clash && String(clash.id) !== String(row.id)) {
        const { error: mvErr } = await supabase.from('expenses').update({ category_id: clash.id }).eq('category_id', row.id);
        if (mvErr) throw new Error(mvErr.message);
        const { error: delErr } = await supabase.from('expense_categories').delete().eq('id', row.id);
        if (delErr) throw new Error(delErr.message);
      } else {
        const { error } = await supabase.from('expense_categories').update({ name: norm(newName) }).eq('id', row.id);
        if (error) throw new Error(error.message);
      }
    }

    // 2) deletes: move the expenses first, then remove the row
    for (const oldName of ch.deletes) {
      const row = await findRow(oldName);
      if (!row) continue;
      const target = ch.moves[oldName];
      if (target) {
        const t = await ensureRow(target);
        if (!t) throw new Error(`Could not find or create the category "${target}"`);
        const { error: mvErr } = await supabase.from('expenses').update({ category_id: t.id }).eq('category_id', row.id);
        if (mvErr) throw new Error(mvErr.message);
      }
      const { error } = await supabase.from('expense_categories').delete().eq('id', row.id);
      if (error) throw new Error(error.message);
    }

    // 3) adds
    for (const name of ch.adds) {
      if (!(await ensureRow(name))) throw new Error(`Could not add "${name}"`);
    }
  }

  // Standard categories the user removed (or renamed away from) stay hidden; added ones come back.
  let nextHidden = [...hidden];
  const hide = (n: string) => {
    if (DEFAULT_EXPENSE_CATEGORIES.some((d) => same(d, n)) && !nextHidden.some((h) => same(h, n))) nextHidden.push(n);
  };
  ch.deletes.forEach(hide);
  Object.keys(ch.renames).forEach(hide);
  const shown = [...ch.adds, ...Object.values(ch.renames)];
  nextHidden = nextHidden.filter((h) => !shown.some((a) => same(a, h)));
  writeHidden(nextHidden);
}
