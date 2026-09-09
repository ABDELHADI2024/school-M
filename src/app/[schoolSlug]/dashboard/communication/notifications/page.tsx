'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  Bell,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CreditCard,
  Megaphone,
  Info,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';

interface Notif {
  id: string;
  type: string;
  message: string;
  created_at: string;
  student_name?: string;
  read_by: string | null;
}

export default function NotificationsPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: s } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (s) {
        setSchool(s);
        setSchoolId(s.id);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolSlug]);

  useEffect(() => {
    if (!schoolId) return;
    loadNotifs();
  }, [schoolId, supabase]);

  const loadNotifs = async () => {
    const { data } = await supabase
      .from('notifications_log')
      .select('id, type, message, created_at, read_by, students(first_name, last_name)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
    setNotifs(((data as any[]) || []).map((n) => ({
      id: n.id, type: n.type, message: n.message, created_at: n.created_at, read_by: n.read_by,
      student_name: n.students ? `${n.students.first_name} ${n.students.last_name}` : undefined,
    })));
  };

  const TYPE_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    absence_late: { label: 'Retard / Absence', icon: <Clock className="h-4 w-4" />, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    finance_due: { label: 'Rappel échéance', icon: <CreditCard className="h-4 w-4" />, cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
    payment_receipt: { label: 'Reçu de paiement', icon: <CheckCircle2 className="h-4 w-4" />, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    announcement: { label: 'Annonce', icon: <Megaphone className="h-4 w-4" />, cls: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
    info: { label: 'Information', icon: <Info className="h-4 w-4" />, cls: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  };

  const generateAlerts = async () => {
    setGenerating(true);
    // 1. Alertes absence/retard du jour
    const today = new Date().toISOString().split('T')[0];
    const { data: absent } = await supabase
      .from('attendance')
      .select('student_id, status, students(first_name, last_name, parent_name)')
      .eq('school_id', schoolId)
      .eq('date', today);

    let created = 0;
    if (absent) {
      const rows = ((absent as any[]) || []).filter((a) => ['absent', 'late'].includes(a.status)).map((a) => ({
        school_id: schoolId, student_id: a.student_id,
        type: 'absence_late',
        message: `${a.students?.first_name} ${a.students?.last_name} est ${a.status === 'late' ? 'en retard' : 'absent(e)'} aujourd'hui.`,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('notifications_log').insert(rows);
        if (!error) created += rows.length;
      }
    }

    // 2. Rappels d'échéances financières (factures impayées / en retard)
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, title, amount_due, amount_paid, due_date, status, students(first_name, last_name, parent_name)')
      .eq('school_id', schoolId)
      .in('status', ['pending', 'partial', 'overdue']);

    if (invoices) {
      const rows = ((invoices as any[]) || []).map((inv) => ({
        school_id: schoolId, student_id: inv.student_id, type: 'finance_due',
        message: `Rappel : facture « ${inv.title} » (${(inv.amount_due - inv.amount_paid).toLocaleString('fr-FR')} FCFA) en attente pour ${inv.students?.first_name} ${inv.students?.last_name}.`,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('notifications_log').insert(rows);
        if (!error) created += rows.length;
      }
    }

    setGenerating(false);
    push('success', `${created} notification(s) générée(s).`);
    loadNotifs();
  };

  const filtered = typeFilter === 'all' ? notifs : notifs.filter((n) => n.type === typeFilter);

  if (loading) {
    return <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 py-20 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <DashToastStack toasts={toasts} onDismiss={dismiss} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href={`/${schoolSlug}/dashboard/communication`} className="p-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition">
              <ArrowLeft className="h-4 w-4 text-slate-300" />
            </Link>
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
              <Bell className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Journal des notifications</h1>
              <p className="text-sm text-slate-400 mt-0.5">Historique des alertes retards / absences et rappels d&apos;échéances financières.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={generateAlerts} disabled={generating}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-700/60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            {generating ? 'Génération…' : 'Générer les alertes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 mb-3"><Clock className="h-5 w-5 text-amber-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{notifs.filter((n) => n.type === 'absence_late').length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Retards / absences</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-rose-500/30 bg-rose-500/10 mb-3"><CreditCard className="h-5 w-5 text-rose-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{notifs.filter((n) => n.type === 'finance_due').length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Rappels financiers</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 mb-3"><CheckCircle2 className="h-5 w-5 text-emerald-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{notifs.filter((n) => n.type === 'payment_receipt').length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Reçus de paiement</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-sky-500/30 bg-sky-500/10 mb-3"><Bell className="h-5 w-5 text-sky-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{notifs.length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Total notifications</p>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60">
          <h2 className="font-bold text-white text-sm">Historique</h2>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-900/70 border border-slate-600 rounded-lg text-xs text-slate-200 outline-none">
            <option value="all">Tous les types</option>
            {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Bell className="h-10 w-10 text-slate-500 mx-auto" />
            <p className="text-slate-200 text-sm font-medium">Aucune notification.</p>
            <p className="text-xs text-slate-400">Cliquez sur « Générer les alertes » pour créer les alertes du jour et les rappels d&apos;échéances.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/60">
            {filtered.map((n) => {
              const meta = TYPE_META[n.type] || TYPE_META.info;
              return (
                <div key={n.id} className="px-5 py-4 flex items-start gap-3 hover:bg-slate-700/40 transition">
                  <span className={`mt-0.5 p-2 rounded-xl border shrink-0 ${meta.cls}`}>{meta.icon}</span>
                  <div className="flex-1">
                    <p className="text-slate-200 text-sm">{n.message}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 font-mono">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${meta.cls.split(' ').slice(0, 2).join(' ')}`}>{meta.label}</span>
                      <span>{n.student_name || '—'}</span>
                      <span>·</span>
                      <span>{new Date(n.created_at).toLocaleString('fr-FR')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
