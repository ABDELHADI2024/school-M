'use client';

import React, { useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School, ModuleItem, PILLIERS } from '@/types';
import {
  ArrowLeft,
  Upload,
  Save,
  Palette,
  Layers,
  ExternalLink,
  CheckCircle2,
  PauseCircle,
  Loader2,
  Mail,
  Phone,
  MapPin,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import { getModuleMeta } from '@/lib/modules';
import { ToastStack, useToasts } from '@/components/toast';

export default function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const schoolId = resolvedParams.id;
  const supabase = createClient();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { toasts, push, dismiss } = useToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [catalog, setCatalog] = useState<ModuleItem[]>([]);
  const [activeModules, setActiveModules] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [moduleFilter, setModuleFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    async function loadSchoolData() {
      setLoading(true);

      const [{ data: schoolData }, { data: allModules }, { data: schoolModules }] =
        await Promise.all([
          supabase.from('schools').select('*').eq('id', schoolId).single(),
          supabase.from('modules').select('*').order('name'),
          supabase.from('school_modules').select('*').eq('school_id', schoolId),
        ]);

      if (schoolData) setSchool(schoolData);
      if (allModules) setCatalog(allModules);

      const moduleMap: Record<string, boolean> = {};
      allModules?.forEach((m) => {
        const found = schoolModules?.find((sm) => sm.module_id === m.id);
        moduleMap[m.id] = found ? found.is_enabled : !!m.is_core;
      });
      setActiveModules(moduleMap);

      setLoading(false);
    }

    loadSchoolData();
  }, [schoolId, supabase]);

  async function patchSchool(body: Record<string, unknown>) {
    const res = await fetch(`/api/super-admin/schools/${encodeURIComponent(schoolId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error || 'Mise à jour impossible');
    }
    return payload?.school as School;
  }

  async function handleSaveBranding() {
    if (!school) return;
    setSaving(true);
    try {
      const updated = await patchSchool({
        name: school.name,
        slug: school.slug,
        logo_url: school.logo_url,
        primary_color: school.primary_color,
        secondary_color: school.secondary_color,
        email: school.email,
        phone: school.phone,
        address: school.address,
        city: school.city,
        currency: school.currency || 'MAD',
      });
      setSchool(updated);
      push('success', 'Modifications enregistrées.');
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!school) return;
    const next = !school.is_active;
    setSchool({ ...school, is_active: next });
    try {
      const updated = await patchSchool({ is_active: next });
      setSchool(updated);
      push('success', next ? 'Établissement activé.' : 'Établissement suspendu.');
    } catch (err) {
      setSchool({ ...school, is_active: !next });
      push('error', err instanceof Error ? err.message : 'Erreur lors du changement de statut.');
    }
  }

  async function handleToggleModule(moduleId: string) {
    if (!school) return;
    const current = !!activeModules[moduleId];
    const next = !current;

    setActiveModules((prev) => ({ ...prev, [moduleId]: next }));
    setToggling((prev) => ({ ...prev, [moduleId]: true }));

    try {
      const res = await fetch(
        `/api/super-admin/schools/${encodeURIComponent(schoolId)}/modules`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modules: { [moduleId]: next } }),
        }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || 'Erreur de mise à jour du module');
      }
      push('success', `Module ${next ? 'activé' : 'désactivé'}.`);
    } catch (err) {
      setActiveModules((prev) => ({ ...prev, [moduleId]: current }));
      push('error', err instanceof Error ? err.message : 'Erreur lors de la mise à jour du module.');
    } finally {
      setToggling((prev) => ({ ...prev, [moduleId]: false }));
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !school) return;

    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(file.type)) {
      push('error', 'Format non supporté. Utilisez PNG, JPG, WebP ou SVG.');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop() || file.type.split('/')[1] || 'png';
    const path = `${schoolId}/logo.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('school-assets')
      .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type });

    if (upErr) {
      push('error', `Téléversement impossible : ${upErr.message}`);
      if (logoInputRef.current) logoInputRef.current.value = '';
      setUploading(false);
      return;
    }

    const { data: pub } = supabase.storage.from('school-assets').getPublicUrl(path);
    const logoUrl = pub.publicUrl;
    setSchool({ ...school, logo_url: logoUrl });

    try {
      const updated = await patchSchool({ logo_url: logoUrl });
      setSchool(updated);
      push('success', 'Logo téléversé et appliqué.');
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Erreur lors de l’application du logo.');
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = '';
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-slate-400 text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
        Chargement de l&apos;établissement…
      </div>
    );
  }

  if (!school) {
    return (
      <div className="flex items-center gap-2 py-24 justify-center text-slate-400 text-sm">
        <AlertCircle className="h-5 w-5 text-rose-400" />
        Établissement introuvable.
      </div>
    );
  }

  const modulesByPillar = PILLIERS.map((pillar) => ({
    ...pillar,
    items: catalog.filter((m) => {
      const belongsToPillar = pillar.modules.includes(m.id) || m.pillar === pillar.id;
      const isEnabled = !!activeModules[m.id];
      const matchesFilter = moduleFilter === 'all' || (moduleFilter === 'active' ? isEnabled : !isEnabled);
      return belongsToPillar && matchesFilter;
    }),
  }));

  const activeModuleCount = Object.values(activeModules).filter(Boolean).length;
  const inactiveModuleCount = Math.max(catalog.length - activeModuleCount, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          href="/super-admin/schools"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la liste des écoles
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href={`/${school.slug}/dashboard`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-200 bg-white/5 border border-slate-700 hover:bg-slate-800 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir le dashboard
          </Link>
          <button
            onClick={handleSaveBranding}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-500/50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-600/25"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enregistrement…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Enregistrer
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* ── Colonne 1 : identité, charte, statut ─────────────────────── */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold border-b border-slate-800 pb-3">
            <Palette className="h-5 w-5 text-indigo-400" />
            <h3>Identité &amp; Charte</h3>
          </div>

          {/* Statut */}
          <div className="flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <div>
              <p className="text-sm font-semibold text-slate-200">Statut de l&apos;établissement</p>
              <p className="text-xs text-slate-500">
                {school.is_active ? 'En service — accès autorisé' : 'Suspendu — accès bloqué'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleStatus}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${
                school.is_active ? 'bg-emerald-500' : 'bg-rose-500/80'
              }`}
              aria-label="Basculer le statut"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${school.is_active ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {!school.is_active && (
            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-xs">
              <PauseCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>L&apos;établissement est suspendu : les membres ne peuvent pas accéder à son espace.</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
              Nom de l&apos;école
            </label>
            <input
              type="text"
              value={school.name}
              onChange={(e) => setSchool({ ...school, name: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
              Identifiant URL (Slug)
            </label>
            <input
              type="text"
              value={school.slug}
              onChange={(e) => setSchool({ ...school, slug: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Rendu unique automatiquement.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                Couleur primaire
              </label>
              <input
                type="color"
                value={school.primary_color}
                onChange={(e) => setSchool({ ...school, primary_color: e.target.value })}
                className="w-full h-10 p-1 bg-slate-950 border border-slate-700 rounded-lg cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                Couleur secondaire
              </label>
              <input
                type="color"
                value={school.secondary_color}
                onChange={(e) => setSchool({ ...school, secondary_color: e.target.value })}
                className="w-full h-10 p-1 bg-slate-950 border border-slate-700 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Logo */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
              Logo
            </label>
            <div className="flex items-center gap-3">
              {school.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={school.logo_url}
                  alt="Logo"
                  className="h-12 w-12 object-contain rounded-lg bg-slate-950 border border-slate-700 p-1"
                />
              ) : (
                <div
                  className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: school.primary_color || '#2563eb' }}
                >
                  {school.name.substring(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                  id="logo-upload"
                />
                <label
                  htmlFor="logo-upload"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/40 hover:bg-indigo-500/20 cursor-pointer transition-colors"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Téléversement…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Changer le logo
                    </>
                  )}
                </label>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Téléversé dans le bucket « school-assets » et appliqué immédiatement.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-1 border-t border-slate-800">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                Email de contact
              </label>
              <input
                type="email"
                value={school.email || ''}
                onChange={(e) => setSchool({ ...school, email: e.target.value })}
                placeholder="contact@ecole.com"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                <Phone className="h-3.5 w-3.5 text-slate-500" />
                Téléphone
              </label>
              <input
                type="tel"
                value={school.phone || ''}
                onChange={(e) => setSchool({ ...school, phone: e.target.value })}
                placeholder="+225 00 00 00 00"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                <MapPin className="h-3.5 w-3.5 text-slate-500" />
                Ville
              </label>
              <input
                type="text"
                value={school.city || ''}
                onChange={(e) => setSchool({ ...school, city: e.target.value })}
                placeholder="Casablanca"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                Devise
              </label>
              <select
                value={school.currency || 'MAD'}
                onChange={(e) => setSchool({ ...school, currency: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="MAD">MAD - Dirham marocain</option>
                <option value="EUR">EUR - Euro</option>
                <option value="USD">USD - Dollar américain</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                <MapPin className="h-3.5 w-3.5 text-slate-500" />
                Adresse complète
              </label>
              <input
                type="text"
                value={school.address || ''}
                onChange={(e) => setSchool({ ...school, address: e.target.value })}
                placeholder="Quartier, rue…"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* ── Colonne 2 : matrice des modules par pilier ──────────────── */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold border-b border-slate-800 pb-3">
            <Layers className="h-5 w-5 text-indigo-400" />
            <h3>Modules activés pour cet établissement</h3>
            <span className="ml-auto text-[11px] font-medium text-slate-400">
              {activeModuleCount}/{catalog.length} actifs
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-1.5">
            {([
              ['all', `Tous · ${catalog.length}`],
              ['active', `Actifs · ${activeModuleCount}`],
              ['inactive', `Inactifs · ${inactiveModuleCount}`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setModuleFilter(value)}
                className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${moduleFilter === value
                  ? 'bg-indigo-600/20 text-indigo-200 ring-1 ring-indigo-500/30'
                  : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-6">
            {modulesByPillar.map((pillar) => (
              <div key={pillar.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{pillar.icon}</span>
                  <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wide">
                    {pillar.label}
                  </h4>
                </div>

                {pillar.items.length === 0 ? (
                  <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-950/60 rounded-xl p-3 border border-dashed border-slate-800">
                    <BarChart3 className="h-4 w-4 text-slate-600" />
                    <span>Aucun module {moduleFilter === 'active' ? 'actif' : moduleFilter === 'inactive' ? 'inactif' : ''} dans ce pilier.</span>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
                    {pillar.items.map((m) => {
                      const isEnabled = !!activeModules[m.id];
                      const isCore = !!m.is_core;
                      const isPending = !!toggling[m.id];
                      const meta = getModuleMeta(m.id, m.name);
                      const Icon = meta.icon;

                      return (
                        <div
                          key={m.id}
                          className="py-3.5 px-4 flex items-center justify-between gap-4 bg-slate-950/40 hover:bg-slate-950/70 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`${meta.color} shrink-0`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-100 text-sm">
                                  {meta.label}
                                </span>
                                {isCore ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Inclus de base
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 truncate">{m.description}</p>
                            </div>
                          </div>

                          {isCore ? (
                            <span className="shrink-0 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30">
                              Activé
                            </span>
                          ) : (
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`hidden text-[10px] font-bold uppercase tracking-wide sm:inline ${isEnabled ? 'text-emerald-400' : 'text-slate-600'}`}>
                                {isEnabled ? 'Actif' : 'Inactif'}
                              </span>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleToggleModule(m.id)}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                                  isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                                } ${isPending ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                                aria-label={`Basculer le module ${meta.label}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                    isEnabled ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}