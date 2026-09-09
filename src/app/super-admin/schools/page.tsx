'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  CheckCircle2,
  PauseCircle,
  School as SchoolIcon,
  UserPlus,
  Users,
  Layers,
  Building2,
  Mail,
  Phone,
  MapPin,
  Loader2,
  MoreVertical,
  Settings2,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { SchoolOverview } from '@/types';
import { ToastStack, useToasts } from '@/components/toast';
import { slugifyName } from '@/lib/slug';

export default function SchoolsManagementPage() {
  const { toasts, push, dismiss } = useToasts();

  const [schools, setSchools] = useState<SchoolOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creationSummary, setCreationSummary] = useState<{
    schoolName: string;
    email: string;
    password: string;
    loginUrl: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    city: '',
    currency: 'MAD',
    email: '',
    phone: '',
    address: '',
    directorFirstName: '',
    directorLastName: '',
    directorEmail: '',
    directorPassword: '',
  });

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<SchoolOverview | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Context menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/super-admin/schools', { cache: 'no-store' });
        const payload = await res.json().catch(() => null);
        if (!cancelled) {
          if (res.ok) {
            setSchools(payload?.schools || []);
          } else {
            push('error', payload?.error || 'Impossible de charger les établissements.');
          }
        }
      } catch {
        if (!cancelled) {
          push('error', 'Erreur réseau : chargement des établissements impossible.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [push]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.ownerFullName || '').toLowerCase().includes(q) ||
        (s.ownerEmail || '').toLowerCase().includes(q)
    );
  }, [schools, search]);

  const stats = useMemo(
    () => ({
      total: schools.length,
      active: schools.filter((s) => s.is_active).length,
      suspended: schools.filter((s) => !s.is_active).length,
      unassigned: schools.filter((s) => !s.ownerEmail).length,
    }),
    [schools]
  );

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    setForm({ ...form, name, slug: slugifyName(name) });
  }

  function generateSecurePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const values = new Uint32Array(16);
    crypto.getRandomValues(values);
    const password = Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
    setForm((current) => ({ ...current, directorPassword: password }));
  }

  async function copyCredentials() {
    if (!creationSummary) return;
    await navigator.clipboard.writeText(
      `Établissement : ${creationSummary.schoolName}\nURL de connexion : ${window.location.origin}${creationSummary.loginUrl}\nEmail : ${creationSummary.email}\nMot de passe : ${creationSummary.password}`
    );
    push('success', 'Identifiants copiés pour le client.');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setCreating(true);

    try {
      const res = await fetch('/api/super-admin/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug || undefined,
          city: form.city,
          currency: form.currency,
          admin: {
            firstName: form.directorFirstName,
            lastName: form.directorLastName,
            email: form.directorEmail,
            password: form.directorPassword,
          },
          email: form.email || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        push('error', payload?.error || 'Création impossible.');
        return;
      }
      push('success', 'Établissement créé avec succès');
      if (payload.school) {
        setSchools((current) => [payload.school as SchoolOverview, ...current]);
      }
      setCreationSummary({
        schoolName: payload.school?.name || form.name,
        email: payload.initialAdmin?.email || form.directorEmail,
        password: payload.initialAdmin?.password || form.directorPassword,
        loginUrl: payload.initialAdmin?.loginUrl || '/login',
      });
      setForm({ name: '', slug: '', city: '', currency: 'MAD', email: '', phone: '', address: '', directorFirstName: '', directorLastName: '', directorEmail: '', directorPassword: '' });
      setIsModalOpen(false);
    } catch {
      push('error', 'Erreur réseau : création impossible.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/super-admin/schools', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: deleteTarget.id }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        push('error', payload?.error || 'Suppression impossible.');
        return;
      }
      push('success', `Établissement « ${deleteTarget.name} » supprimé.`);
      setSchools((current) => current.filter((school) => school.id !== deleteTarget.id));
      setDeleteTarget(null);
      setOpenMenuId(null);
    } catch {
      push('error', 'Erreur réseau : suppression impossible.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-6xl space-y-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-600/[0.08] blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300">
            <Building2 className="h-3.5 w-3.5" />
            Réseau établissements
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Établissements partenaires</h2>
          <p className="mt-2 text-sm text-slate-400">
            Gère les écoles, leurs chartes graphiques et leurs modules actifs.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xl shadow-indigo-950/40 transition-transform hover:scale-[1.02] hover:shadow-indigo-500/25"
        >
          <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
          Nouvel Établissement
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Écoles', value: stats.total, icon: Building2, color: 'text-indigo-400', halo: 'bg-indigo-500/10' },
          { label: 'Actives', value: stats.active, icon: CheckCircle2, color: 'text-emerald-400', halo: 'bg-emerald-500/10' },
          { label: 'Suspendues', value: stats.suspended, icon: PauseCircle, color: 'text-rose-400', halo: 'bg-rose-500/10' },
          { label: 'Sans propriétaire', value: stats.unassigned, icon: UserPlus, color: 'text-amber-400', halo: 'bg-amber-500/10' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/50 px-5 py-4 shadow-2xl shadow-indigo-950/20 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/[0.14]">
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-indigo-500/[0.06] blur-2xl" />
              <div className="relative flex items-center gap-4">
              <div className={`${s.halo} rounded-xl border border-white/[0.08] p-2.5`}>
                <Icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-3xl font-extrabold tracking-tight text-white">{s.value}</p>
                <p className="mt-1 text-xs text-slate-400">{s.label}</p>
              </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, slug, propriétaire ou email…"
          className="w-full rounded-xl border border-white/[0.08] bg-slate-900/50 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 shadow-xl shadow-indigo-950/10 backdrop-blur-xl transition focus:border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/50 shadow-2xl shadow-indigo-950/20 backdrop-blur-xl">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400 text-sm">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            Chargement des établissements…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <SchoolIcon className="h-12 w-12 text-slate-700 mx-auto mb-3" />
            {search ? (
              <p className="text-slate-400 font-medium">Aucun établissement ne correspond à votre recherche.</p>
            ) : (
              <p className="text-slate-400 font-medium">Aucune école enregistrée pour le moment.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-5 py-3.5 font-semibold">Établissement</th>
                  <th className="px-5 py-3.5 font-semibold">Propriétaire</th>
                  <th className="px-5 py-3.5 font-semibold">Modules</th>
                  <th className="px-5 py-3.5 font-semibold">Élèves</th>
                  <th className="px-5 py-3.5 font-semibold">Statut</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filtered.map((school) => (
                  <tr key={school.id} className="group transition-colors hover:bg-white/[0.035]">
                    <td className="px-5 py-4">
                      <Link href={`/super-admin/schools/${school.id}`} className="flex items-center gap-3">
                        {school.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={school.logo_url}
                            alt={school.name}
                            className="h-10 w-10 shrink-0 rounded-xl border border-white/[0.1] bg-slate-800/80 p-0.5 object-contain"
                          />
                        ) : (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-lg"
                            style={{ backgroundColor: school.primary_color || '#2563eb' }}
                          >
                            {school.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-100 text-sm group-hover:text-indigo-300 transition-colors truncate">
                            {school.name}
                          </p>
                          <span className="text-xs text-slate-500">/{school.slug}</span>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      {school.ownerEmail ? (
                        <>
                          <p className="text-sm text-slate-300 truncate max-w-[200px]">
                            {school.ownerFullName || '—'}
                          </p>
                          <p className="text-xs text-slate-500 truncate max-w-[200px]">
                            {school.ownerEmail}
                          </p>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30">
                          <UserPlus className="h-3 w-3" />
                          Aucun propriétaire
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 bg-violet-500/10 border border-violet-500/30 px-2.5 py-1 rounded-lg">
                        <Layers className="h-3.5 w-3.5" />
                        {school.moduleCount} modules
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        {school.studentsCount}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {school.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md">
                          <CheckCircle2 className="h-3 w-3" />
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-md">
                          <PauseCircle className="h-3 w-3" />
                          Suspendue
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end">
                        <div className="relative" ref={openMenuId === school.id ? menuRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === school.id ? null : school.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            aria-label="Menu d'actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {openMenuId === school.id && (
                            <div className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-white/[0.1] bg-slate-900/95 py-1 shadow-2xl shadow-black/40 backdrop-blur-xl">
                              <Link
                                href={`/super-admin/schools/${school.id}`}
                                onClick={() => setOpenMenuId(null)}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-200 hover:bg-slate-700/60 transition-colors"
                              >
                                <Settings2 className="h-4 w-4 text-indigo-400 shrink-0" />
                                Gérer les modules &amp; identité
                              </Link>
                              <a
                                href={`/${school.slug}/dashboard`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setOpenMenuId(null)}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-200 hover:bg-slate-700/60 transition-colors"
                              >
                                <ExternalLink className="h-4 w-4 text-sky-400 shrink-0" />
                                Ouvrir l&apos;école
                              </a>
                              <div className="border-t border-slate-700 my-1" />
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDeleteTarget(school);
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                              >
                                <Trash2 className="h-4 w-4 shrink-0" />
                                Supprimer l&apos;établissement
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="relative max-h-[90vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-2xl border border-white/[0.1] bg-slate-900/95 p-6 shadow-2xl shadow-indigo-950/40 backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
            <div>
              <div className="relative mb-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300">
                <Plus className="h-3.5 w-3.5" />
                Nouveau workspace
              </div>
              <h3 className="text-xl font-bold tracking-tight text-white">Créer un établissement</h3>
              <p className="mt-1 text-sm text-slate-400">
                Les modules « inclus de base » seront automatiquement activés.
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                  Nom de l&apos;école *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Collège Victor Hugo"
                  value={form.name}
                  onChange={handleNameChange}
                  className="w-full rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_20px_rgba(99,102,241,0.12)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                    <MapPin className="h-3.5 w-3.5 text-slate-500" />
                    Ville *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex : Casablanca"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_20px_rgba(99,102,241,0.12)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                    Devise *
                  </label>
                  <select
                    required
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_20px_rgba(99,102,241,0.12)]"
                  >
                    <option value="MAD">MAD - Dirham marocain</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="USD">USD - Dollar américain</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                  Identifiant URL (Slug)
                </label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_20px_rgba(99,102,241,0.12)]"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Auto-généré depuis le nom ; rendu unique automatiquement.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                    <Mail className="h-3.5 w-3.5 text-slate-500" />
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="contact@ecole.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_20px_rgba(99,102,241,0.12)]"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                    <Phone className="h-3.5 w-3.5 text-slate-500" />
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    placeholder="+225 00 00 00 00"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                  <MapPin className="h-3.5 w-3.5 text-slate-500" />
                  Adresse
                </label>
                <input
                  type="text"
                  placeholder="Quartier, ville…"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_20px_rgba(99,102,241,0.12)]"
                />
              </div>

              <div className="space-y-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] p-4">
                <div>
                  <p className="text-sm font-bold text-white">Administrateur de l&apos;établissement</p>
                  <p className="mt-1 text-xs text-slate-400">Un compte Direction sera créé et rattaché automatiquement à cette école.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1.5">Prénom *</label>
                    <input
                      type="text"
                      required
                      placeholder="Youssef"
                      value={form.directorFirstName}
                      onChange={(e) => setForm({ ...form, directorFirstName: e.target.value })}
                      className="w-full rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1.5">Nom *</label>
                    <input
                      type="text"
                      required
                      placeholder="El Mansouri"
                      value={form.directorLastName}
                      onChange={(e) => setForm({ ...form, directorLastName: e.target.value })}
                      className="w-full rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1.5">Email professionnel *</label>
                  <input
                    type="email"
                    required
                    placeholder="direction@ecole.ma"
                    value={form.directorEmail}
                    onChange={(e) => setForm({ ...form, directorEmail: e.target.value })}
                    className="w-full rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1.5">Mot de passe initial *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      minLength={10}
                      value={form.directorPassword}
                      onChange={(e) => setForm({ ...form, directorPassword: e.target.value })}
                      placeholder="Générez un mot de passe sécurisé"
                      className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <button
                      type="button"
                      onClick={generateSecurePassword}
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-3 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Générer
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-white/[0.08] pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-xl font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition hover:shadow-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Création…
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Créer l&apos;établissement
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {creationSummary && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-md space-y-5 rounded-2xl border border-emerald-400/20 bg-slate-900/95 p-6 shadow-2xl shadow-emerald-950/30">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Provisionnement terminé</h3>
                <p className="mt-1 text-sm text-slate-400">L&apos;administrateur peut maintenant accéder à son espace.</p>
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-white/[0.08] bg-slate-950/70 p-4 text-sm">
              <div><span className="text-slate-500">Établissement</span><p className="font-semibold text-white">{creationSummary.schoolName}</p></div>
              <div><span className="text-slate-500">Lien de connexion</span><p className="font-semibold text-indigo-300">{creationSummary.loginUrl}</p></div>
              <div><span className="text-slate-500">Email directeur</span><p className="font-semibold text-white">{creationSummary.email}</p></div>
              <div><span className="text-slate-500">Mot de passe initial</span><p className="break-all font-mono font-semibold text-emerald-300">{creationSummary.password}</p></div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreationSummary(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06]"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={copyCredentials}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition hover:shadow-indigo-500/25"
              >
                <Copy className="h-4 w-4" />
                Copier les identifiants
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md space-y-5 rounded-2xl border border-rose-400/20 bg-slate-900/95 p-6 shadow-2xl shadow-rose-950/30 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-2.5">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Supprimer l&apos;établissement</h3>
                <p className="text-sm text-slate-400">Cette action est irréversible.</p>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-slate-950/60 p-4">
              <p className="text-sm text-slate-300">
                Voulez-vous vraiment supprimer <strong className="text-white">{deleteTarget.name}</strong> ({deleteTarget.slug}) ?
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Les modules et les données rattachées à cet établissement peuvent également être supprimés par les cascades de la base de données.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-xl font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-rose-600 hover:bg-rose-500 disabled:bg-rose-500/50 text-white rounded-xl font-medium shadow-lg shadow-rose-600/25 transition-colors"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Suppression…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Supprimer définitivement
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
