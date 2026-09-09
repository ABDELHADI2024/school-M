'use client';

import React, { useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  Megaphone,
  Plus,
  Save,
  X,
  Loader2,
  Globe,
  Users,
  Trash2,
  Bell,
} from 'lucide-react';
import Link from 'next/link';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';

interface Announcement {
  id: string;
  title: string;
  content: string | null;
  target: string;
  created_at: string;
  class_names?: string[];
}

export default function CommunicationPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', target: 'all', class_ids: [] as string[] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: s } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (s) {
        setSchool(s);
        setSchoolId(s.id);
        const { data: { user } } = await supabase.auth.getUser();
        let staff = false;
        if (user) {
          const { data: p } = await supabase.from('user_profiles').select('role').eq('user_id', user.id).maybeSingle();
          staff = ['school_admin', 'director', 'staff'].includes(p?.role || '');
        }
        setIsStaff(staff);
        const { data: cls } = await supabase.from('classes').select('id, name').eq('school_id', s.id);
        setClasses(cls || []);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolSlug]);

  useEffect(() => {
    if (!schoolId) return;
    async function loadAnnouncements() {
      const { data: ann } = await supabase.from('announcements').select('*').eq('school_id', schoolId).order('created_at', { ascending: false });
      const targetRows = await Promise.all((ann || []).map(async (a) => {
        const { data: cls } = await supabase.from('announcement_targets').select('classes(name)').eq('announcement_id', a.id);
        return { ...a, class_names: (cls || []).map((c: any) => c.classes?.name).filter(Boolean) };
      }));
      setAnnouncements(targetRows || []);
    }
    loadAnnouncements();
  }, [schoolId, supabase]);

  const saveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (form.target === 'all') {
      const { data, error } = await supabase.from('announcements').insert([{
        school_id: schoolId, title: form.title, content: form.content || null, target: 'all',
        created_by: (await supabase.auth.getUser()).data.user?.id,
      }]).select().single();
      setSaving(false);
      if (error) push('error', error.message);
      else {
        push('success', 'Annonce publiée pour tout le monde.');
        setAnnouncements([{ ...data, class_names: [] }, ...announcements]);
        setModal(false);
        setForm({ title: '', content: '', target: 'all', class_ids: [] });
      }
    } else {
      if (form.class_ids.length === 0) {
        setSaving(false);
        push('error', 'Sélectionnez au moins une classe.');
        return;
      }
      const { data, error } = await supabase.from('announcements').insert([{
        school_id: schoolId, title: form.title, content: form.content || null, target: 'classes',
        created_by: (await supabase.auth.getUser()).data.user?.id,
      }]).select().single();
      if (error) {
        setSaving(false);
        push('error', error.message);
        return;
      }
      const { error: te } = await supabase.from('announcement_targets').insert(
        form.class_ids.map((class_id) => ({ announcement_id: data.id, class_id }))
      );
      setSaving(false);
      if (te) push('error', te.message);
      else {
        const names = classes.filter((c) => form.class_ids.includes(c.id)).map((c) => c.name);
        push('success', `Annonce publiée pour ${names.length} classe(s).`);
        setAnnouncements([{ ...data, class_names: names }, ...announcements]);
        setModal(false);
        setForm({ title: '', content: '', target: 'all', class_ids: [] });
      }
    }
  };

  const removeAnnouncement = async (id: string) => {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) push('error', error.message);
    else {
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      push('success', 'Annonce supprimée.');
    }
  };

  const toggleClass = (id: string) => {
    setForm((prev) => ({
      ...prev,
      class_ids: prev.class_ids.includes(id) ? prev.class_ids.filter((x) => x !== id) : [...prev.class_ids, id],
    }));
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 py-20 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <DashToastStack toasts={toasts} onDismiss={dismiss} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
              <Megaphone className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Annonces & Communication</h1>
              <p className="text-sm text-slate-400 mt-0.5">Annonces officielles de l&apos;école, ciblées ou générales.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/${schoolSlug}/dashboard/communication/notifications`}
            className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium transition">
            <Bell className="h-4 w-4 text-amber-400" /> Journal des notifications
          </Link>
          {isStaff && (
            <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition">
              <Plus className="h-4 w-4" /> Publier une annonce
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-sky-500/30 bg-sky-500/10 mb-3"><Megaphone className="h-5 w-5 text-sky-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{announcements.length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Annonces publiées</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 mb-3"><Globe className="h-5 w-5 text-emerald-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{announcements.filter((a) => a.target === 'all').length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Ciblage « Tout le monde »</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 mb-3"><Users className="h-5 w-5 text-indigo-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{announcements.filter((a) => a.target === 'classes').length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Ciblé par classe</p>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-700/60 bg-slate-900/60">
          <h2 className="font-bold text-white text-sm">Annonces officielles</h2>
        </div>
        {announcements.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Megaphone className="h-10 w-10 text-slate-500 mx-auto" />
            <p className="text-slate-200 text-sm font-medium">Aucune annonce.</p>
            <p className="text-xs text-slate-400">Publiez la première annonce officielle de l&apos;école.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/60">
            {announcements.map((a) => (
              <div key={a.id} className="p-5 hover:bg-slate-700/40 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 rounded-xl bg-sky-500/10 border border-sky-500/30">
                      <Megaphone className="h-4 w-4 text-sky-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">{a.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">{new Date(a.created_at).toLocaleDateString('fr-FR')} à {new Date(a.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                      {a.content && <p className="text-slate-300 text-sm mt-2 whitespace-pre-wrap">{a.content}</p>}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${a.target === 'all' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                          {a.target === 'all' ? '🌍 Tout le monde' : '🎯 Classes spécifiques'}
                        </span>
                        {(a.class_names || []).map((c) => (
                          <span key={c} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300">{c}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {isStaff && (
                    <button onClick={() => removeAnnouncement(a.id)} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal publication */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="font-bold text-white">Publier une annonce</h3>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveAnnouncement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Titre *</label>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex : Réunion de rentrée"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Contenu</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Détail de l'annonce…"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none min-h-28 focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Ciblage *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setForm({ ...form, target: 'all' })}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition ${form.target === 'all' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800 text-slate-300 border-slate-600'}`}>
                    🌍 Tout le monde
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, target: 'classes' })}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition ${form.target === 'classes' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-300 border-slate-600'}`}>
                    🎯 Classes spécifiques
                  </button>
                </div>
              </div>
              {form.target === 'classes' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Classes concernées *</label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {classes.map((c) => (
                      <button key={c.id} type="button" onClick={() => toggleClass(c.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition ${form.class_ids.includes(c.id) ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-slate-500'}`}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-xl font-medium transition">Annuler</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm transition">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Publier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
