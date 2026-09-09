'use client';

import React, { useEffect, useMemo, useState, use, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Wallet,
  Receipt,
  UtensilsCrossed,
  Bus,
  FileText,
  BookOpen,
  Check,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';
import { formatMoney } from '@/lib/format';

interface ClassRow {
  id: string;
  name: string;
  level: string | null;
}

interface FeeType {
  id: string;
  name: string;
  amount: number;
  category: string;
  description: string | null;
  is_active: boolean;
  class_prices: { class_id: string; amount: number }[];
}

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  inscription: { label: 'Inscription', icon: FileText, color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  ecolage: { label: 'Écolage', icon: BookOpen, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  cantine: { label: 'Cantine', icon: UtensilsCrossed, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  transport: { label: 'Transport', icon: Bus, color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  autres: { label: 'Autres', icon: Wallet, color: 'text-slate-400 bg-slate-500/10 border-slate-500/30' },
};

const INITIAL_FORM = {
  name: '',
  category: 'ecolage',
  amount: '',
  description: '',
  is_active: true,
  class_prices: [] as { class_id: string; amount: string }[],
};

export default function TarifsPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FeeType | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: schoolData } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (!schoolData) {
        if (!cancelled) setLoading(false);
        return;
      }
      setSchool(schoolData);
      setSchoolId(schoolData.id);

      let currentRole = '';
      if (user) {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        currentRole = profileData?.role ?? '';
      }

      const res = await fetch(`/api/school/finance/fee-types?schoolId=${encodeURIComponent(schoolData.id)}`, { cache: 'no-store' });
      const payload = (res.ok ? await res.json().catch(() => null) : null) || { fee_types: [], classes: [] };
      if (!cancelled) {
        setFeeTypes(payload.fee_types || []);
        setClasses(payload.classes || []);
        if (currentRole === 'teacher') push('info', 'Lecture seule.');
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [schoolSlug, supabase, reloadKey, push]);

  const grouped = useMemo(() => {
    const order = ['inscription', 'ecolage', 'cantine', 'transport', 'autres'];
    const map = new Map<string, FeeType[]>();
    feeTypes.forEach((f) => {
      const arr = map.get(f.category) || [];
      arr.push(f);
      map.set(f.category, arr);
    });
    return order.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [feeTypes]);

  function openCreate() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setIsFormOpen(true);
  }

  function openEdit(ft: FeeType) {
    setEditingId(ft.id);
    setForm({
      name: ft.name,
      category: ft.category,
      amount: String(ft.amount ?? ''),
      description: ft.description || '',
      is_active: ft.is_active,
      class_prices: ft.class_prices.map((p) => ({ class_id: p.class_id, amount: String(p.amount) })),
    });
    setIsFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    setSaving(true);
    try {
      const body = {
        name: form.name,
        category: form.category,
        amount: Number(form.amount) || 0,
        description: form.description,
        is_active: form.is_active,
        class_prices: form.class_prices
          .filter((p) => p.class_id && p.amount !== '')
          .map((p) => ({ class_id: p.class_id, amount: Number(p.amount) })),
      };
      const url = `/api/school/finance/fee-types?schoolId=${encodeURIComponent(schoolId)}${editingId ? `&id=${editingId}` : ''}`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        push('error', payload?.error || 'Enregistrement impossible.');
        return;
      }
      push('success', editingId ? 'Type de frais mis à jour.' : 'Type de frais créé.');
      setIsFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch {
      push('error', 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !schoolId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/school/finance/fee-types?schoolId=${encodeURIComponent(schoolId)}&id=${deleteTarget.id}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        push('error', payload?.error || 'Suppression impossible.');
        return;
      }
      push('success', 'Type de frais supprimé.');
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch {
      push('error', 'Erreur réseau.');
    } finally {
      setDeleting(false);
    }
  }

  const toggleClassPrice = (classId: string) => {
    setForm((f) => {
      const exists = f.class_prices.some((p) => p.class_id === classId);
      if (exists) return { ...f, class_prices: f.class_prices.filter((p) => p.class_id !== classId) };
      return { ...f, class_prices: [...f.class_prices, { class_id: classId, amount: '' }] };
    });
  };

  const setClassAmount = (classId: string, amount: string) => {
    setForm((f) => ({
      ...f,
      class_prices: f.class_prices.map((p) => (p.class_id === classId ? { ...p, amount } : p)),
    }));
  };

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center flex items-center justify-center gap-2 text-slate-400 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des grilles tarifaires…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <DashToastStack toasts={toasts} onDismiss={dismiss} />

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
              <Wallet className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Grilles Tarifaires</h1>
              <p className="text-sm text-slate-400 mt-0.5">Types de frais par classe / niveau — base de la facturation.</p>
            </div>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition"
        >
          <Plus className="h-4 w-4" />
          Nouveau type de frais
        </button>
      </div>

      {/* Groupes par catégorie */}
      {grouped.length === 0 ? (
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl py-16 text-center space-y-3">
          <Tag className="h-10 w-10 text-slate-600 mx-auto" />
          <p className="text-slate-200 font-medium">Aucun type de frais configuré.</p>
          <p className="text-sm text-slate-400">Créez vos frais d&apos;inscription, d&apos;écolage, de cantine ou de transport.</p>
        </div>
      ) : (
        grouped.map((g) => {
          const meta = CATEGORY_META[g.category] || CATEGORY_META.autres;
          const Icon = meta.icon;
          const totalMonthly = g.items.reduce((s, f) => s + f.amount, 0);
          return (
            <div key={g.category} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${meta.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                  <span className="text-xs text-slate-500">{g.items.length} type(s)</span>
                </div>
                <span className="text-xs text-slate-400">{formatMoney(totalMonthly)} / base</span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.items.map((ft) => (
                  <div key={ft.id} className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5 space-y-3 hover:border-slate-600 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">{ft.name}</p>
                        {ft.description ? <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{ft.description}</p> : null}
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${ft.is_active ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-slate-500 bg-slate-700/40 border-slate-600'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${ft.is_active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                        {ft.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-white">{formatMoney(ft.amount)}</p>
                    <p className="text-xs text-slate-400">
                      {ft.class_prices.length > 0
                        ? `${ft.class_prices.length} tarif(s) spécifique(s) par classe`
                        : 'Tarif unique pour toutes les classes'}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => openEdit(ft)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifier
                      </button>
                      <button
                        onClick={() => setDeleteTarget(ft)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Modale création / édition */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="font-bold text-white">{editingId ? 'Modifier le type de frais' : 'Nouveau type de frais'}</h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Libellé *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex : Écolage trimestriel 6ème"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Catégorie</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none">
                    {Object.entries(CATEGORY_META).map(([key, m]) => (
                      <option key={key} value={key}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Montant (FCFA) *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Tarifs spécifiques par classe</label>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${form.is_active ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-slate-400 bg-slate-700/40 border-slate-600'}`}
                  >
                    {form.is_active ? 'Actif' : 'Inactif'}
                  </button>
                </div>
                {classes.length === 0 ? (
                  <p className="text-xs text-slate-500">Aucune classe disponible.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {classes.map((c) => {
                      const p = form.class_prices.find((x) => x.class_id === c.id);
                      return (
                        <div key={c.id} className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
                          <input type="checkbox" checked={!!p} onChange={() => toggleClassPrice(c.id)} className="accent-emerald-500" />
                          <span className="flex-1 text-sm text-slate-200 truncate">{c.name}</span>
                          {p && (
                            <input
                              type="number"
                              min={0}
                              placeholder="Montant"
                              value={p.amount}
                              onChange={(e) => setClassAmount(c.id, e.target.value)}
                              className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-100 outline-none"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
                <button type="button" onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-xl font-medium transition">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-700/60 text-white rounded-xl font-medium shadow-sm transition">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale suppression */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/30">
                <Trash2 className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Supprimer le type de frais</h3>
                <p className="text-sm text-slate-400">Les factures existantes seront conservées.</p>
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-sm text-slate-200">Supprimer <strong className="text-white">{deleteTarget.name}</strong> et ses tarifs par classe ?</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-xl font-medium transition">
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-rose-600 hover:bg-rose-500 disabled:bg-rose-700/60 text-white rounded-xl font-medium shadow-sm transition">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
