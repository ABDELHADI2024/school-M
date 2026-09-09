'use client';

import React, { useEffect, useState, use, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  CalendarCheck,
  GraduationCap,
  CreditCard,
  Loader2,
  User as UserIcon,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wallet,
  Printer,
  LogOut,
  Baby,
  Bus,
  UtensilsCrossed,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';
import { formatMoney, formatDate } from '@/lib/format';
import { downloadCashReceipt } from '@/lib/pdf/cashReceiptPdf';

interface Child {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name?: string;
  parent_name?: string;
}

interface AttendanceRow {
  date: string;
  status: string;
  note?: string | null;
}

interface GradeRow {
  evaluation_id: string;
  score: number;
  evaluation_title?: string;
  subject_name?: string;
  max_score: number;
  coefficient: number;
}

interface InvoiceRow {
  id: string;
  title: string;
  amount_due: number;
  amount_paid: number;
  due_date: string | null;
  status: string;
}

interface PaymentRow {
  id: string;
  reference: string | null;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
}

export default function ParentPortalPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const [tab, setTab] = useState<'presence' | 'notes' | 'finances'>('presence');

  // Présence
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [monthStart, setMonthStart] = useState(() => new Date().toISOString().slice(0, 7) + '-01');

  // Notes
  const [grades, setGrades] = useState<GradeRow[]>([]);

  // Finances
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [payingFor, setPayingFor] = useState<InvoiceRow | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: s } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (s) setSchool(s);
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u);
      if (u) {
        const { data: ch } = await supabase
          .from('students')
          .select('id, matricule, first_name, last_name, class_id, parent_name, classes(name)')
          .eq('parent_user_id', u.id)
          .eq('school_id', s?.id);
        const mapped: Child[] = (ch || []).map((c) => ({
          id: c.id, matricule: c.matricule, first_name: c.first_name, last_name: c.last_name,
          class_id: c.class_id, class_name: (c.classes as any)?.name, parent_name: c.parent_name,
        }));
        setChildren(mapped);
        if (mapped.length > 0) setSelectedId(mapped[0].id);
      }
      setLoading(false);
      setReady(true);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolSlug]);

  const selectedChild = children.find((c) => c.id === selectedId);

  useEffect(() => {
    if (!selectedId || !school || !user) return;
    const sid = selectedId;
    async function loadData() {
      // Présence du mois
      const { data: att } = await supabase
        .from('attendance')
        .select('date, status, note')
        .eq('school_id', school?.id)
        .eq('student_id', sid)
        .gte('date', monthStart);
      setAttendance(att || []);

      // Notes : évaluations de la classe de l'élève + notes
      const child = children.find((c) => c.id === sid);
      let evsData: any[] = [];
      if (child?.class_id) {
        const { data: evs } = await supabase
          .from('evaluations')
          .select('id, title, max_score, coefficient, term, subject_id, subjects(name)')
          .eq('school_id', school?.id)
          .eq('class_id', child.class_id);
        evsData = evs || [];
      }
      const evalIds = evsData.map((e) => e.id);
      let grData: any[] = [];
      if (evalIds.length > 0) {
        const { data: gr } = await supabase
          .from('grades')
          .select('evaluation_id, score')
          .eq('student_id', sid)
          .in('evaluation_id', evalIds);
        grData = gr || [];
      }
      const gradesMapped: GradeRow[] = grData.map((g) => {
        const ev = evsData.find((e) => e.id === g.evaluation_id);
        return {
          evaluation_id: g.evaluation_id, score: Number(g.score), max_score: Number(ev?.max_score || 20),
          coefficient: Number(ev?.coefficient || 1), evaluation_title: ev?.title, subject_name: (ev?.subjects as any)?.name,
        };
      });
      setGrades(gradesMapped);

      // Factures + paiements
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, title, amount_due, amount_paid, due_date, status')
        .eq('school_id', school?.id)
        .eq('student_id', sid)
        .order('due_date', { ascending: false });
      setInvoices(inv || []);
      const { data: pay } = await supabase
        .from('payments')
        .select('id, reference, amount_paid, payment_date, payment_method')
        .eq('school_id', school?.id)
        .eq('invoice_id', inv?.map((i) => i.id) || [])
        .order('payment_date', { ascending: false });
      setPayments(pay || []);
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, school, user, monthStart]);

  const presenceStats = useMemo(() => {
    if (attendance.length === 0) return { present: 0, rate: 0, absent: 0, late: 0, excused: 0 };
    const present = attendance.filter((a) => a.status === 'present').length;
    const absent = attendance.filter((a) => a.status === 'absent').length;
    const late = attendance.filter((a) => a.status === 'late').length;
    const excused = attendance.filter((a) => a.status === 'excused').length;
    const rate = attendance.length > 0 ? (present / attendance.length) * 100 : 0;
    return { present, rate, absent, late, excused };
  }, [attendance]);

  const gradeStats = useMemo(() => {
    if (grades.length === 0) return { average: 0, count: 0 };
    let totalW = 0;
    let totalC = 0;
    grades.forEach((g) => {
      totalW += g.score * g.coefficient;
      totalC += g.coefficient;
    });
    return { average: totalC > 0 ? totalW / totalC : 0, count: grades.length };
  }, [grades]);

  const financeStats = useMemo(() => {
    const due = invoices.length > 0 ? invoices.reduce((s, i) => s + (Number(i.amount_due) - Number(i.amount_paid)), 0) : 0;
    const paid = payments.length > 0 ? payments.reduce((s, p) => s + Number(p.amount_paid), 0) : 0;
    return { due, paid };
  }, [invoices, payments]);

  const payInvoice = async (inv: InvoiceRow) => {
    setPayingFor(inv);
    const due = Number(inv.amount_due) - Number(inv.amount_paid);
    const { data, error } = await fetch(`/api/school/parent/pay?schoolId=${school?.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: inv.id, amount_paid: due, payment_method: 'bank_transfer', payment_date: new Date().toISOString().slice(0, 10) }),
    }).then((r) => r.json()).catch((e) => ({ error: e.message }));

    setPayingFor(null);
    if (error) push('error', error);
    else {
      push('success', `Règlement de ${formatMoney(due)} confirmé et reçu généré.`);
      const { data: pay } = await supabase
        .from('payments')
        .select('id, reference, amount_paid, payment_date, payment_method')
        .eq('school_id', school?.id)
        .eq('invoice_id', inv.id)
        .order('payment_date', { ascending: false });
      if (pay && pay.length > 0) setPayments((prev) => [...pay, ...prev]);

      const { data: refInvoices } = await supabase
        .from('invoices')
        .select('id, title, amount_due, amount_paid, due_date, status')
        .eq('school_id', school?.id)
        .eq('student_id', selectedId);
      setInvoices(refInvoices || []);
      void data;
    }
  };

  const downloadReceipt = (p: PaymentRow) => {
    if (!school) return;
    downloadCashReceipt({
      receiptRef: p.reference || '—',
      schoolName: school.name,
      schoolAddress: school.address,
      schoolPhone: school.phone,
      schoolEmail: school.email,
      schoolLogoUrl: school.logo_url,
      primaryColor: school.primary_color || '#2563EB',
      studentMatricule: selectedChild?.matricule || '',
      studentName: `${selectedChild?.first_name || ''} ${selectedChild?.last_name || ''}`.trim() || '—',
      className: selectedChild?.class_name || '',
      invoiceReference: p.reference || '',
      invoiceTitle: 'Règlement — Portail parent',
      amountPaid: Number(p.amount_paid),
      amountDue: Number(p.amount_paid),
      remainingDue: 0,
      paymentMethod: p.payment_method,
      paymentDate: p.payment_date,
      operator: user?.email || 'Parent',
      academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    });
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="flex items-center gap-2 text-slate-300 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Chargement du portail parent…</div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/80 border border-slate-700 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-4">
            <Baby className="h-7 w-7 text-indigo-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Portail Parent</h1>
          <p className="text-slate-400 text-sm mt-2">Connectez-vous pour consulter la scolarité, les notes et les finances de vos enfants.</p>
          <Link href="/login" className="inline-flex items-center justify-center gap-2 mt-6 w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-semibold">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  if (!ready) return null;

  if (children.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/80 border border-slate-700 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-white">Aucun enfant rattaché</h1>
          <p className="text-slate-400 text-sm mt-2">Ce compte parent n&apos;est lié à aucun élève. Contactez l&apos;établissement.</p>
        </div>
      </div>
    );
  }

  const STATUS_LABEL: Record<string, string> = {
    present: 'Présent', absent: 'Absent', late: 'Retard', excused: 'Excusé',
  };
  const STATUS_CLS: Record<string, string> = {
    present: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    absent: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    late: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    excused: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <DashToastStack toasts={toasts} onDismiss={dismiss} />

      {/* En-tête mobile-first */}
      <div className="bg-slate-800/70 border-b border-slate-700 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
              <Baby className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Portail Parent</h1>
              <p className="text-xs text-slate-400">{school?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 hidden sm:inline">{user.email}</span>
            <Link href="/logout" className="p-2 rounded-xl bg-slate-700/60 hover:bg-slate-600 text-slate-300 transition"><LogOut className="h-4 w-4" /></Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Sélecteur d'enfant */}
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Élève</label>
          <div className="relative">
            <Baby className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-100 font-medium appearance-none outline-none focus:ring-2 focus:ring-indigo-500">
              {children.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} · {c.class_name || 'Classe —'} · {c.matricule}</option>)}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          </div>
          {selectedChild?.parent_name && <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> {selectedChild.parent_name}</p>}
        </div>

        {/* Onglets */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {([
            ['presence', 'Présence', CalendarCheck, 'text-emerald-400'],
            ['notes', 'Notes', GraduationCap, 'text-indigo-400'],
            ['finances', 'Finances', Wallet, 'text-amber-400'],
          ] as const).map(([key, label, Icon, color]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition shrink-0 ${tab === key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
              <Icon className={`h-4 w-4 ${tab === key ? 'text-white' : color}`} />
              {label}
            </button>
          ))}
        </div>

        {/* Onglet Présence */}
        {tab === 'presence' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
                <p className="text-2xl font-bold text-emerald-400 leading-none">{presenceStats.rate.toFixed(0)}%</p>
                <p className="text-xs text-slate-400 mt-1.5">Taux de présence (mois)</p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
                <p className="text-2xl font-bold text-white leading-none">{presenceStats.present}</p>
                <p className="text-xs text-slate-400 mt-1.5">Présences</p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
                <p className="text-2xl font-bold text-amber-400 leading-none">{presenceStats.late}</p>
                <p className="text-xs text-slate-400 mt-1.5">Retards</p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
                <p className="text-2xl font-bold text-rose-400 leading-none">{presenceStats.absent}</p>
                <p className="text-xs text-slate-400 mt-1.5">Absences</p>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-700/60 bg-slate-900/60 flex items-center justify-between">
                <h2 className="font-bold text-white text-sm">Détail du mois</h2>
                <input type="month" value={monthStart.slice(0, 7)} onChange={(e) => setMonthStart(e.target.value + '-01')}
                  className="px-3 py-1.5 bg-slate-900/70 border border-slate-600 rounded-lg text-xs text-slate-200 outline-none" />
              </div>
              {attendance.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Aucun pointage ce mois-ci.</div>
              ) : (
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-700/60">
                  {attendance.slice().reverse().map((a, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${STATUS_CLS[a.status]}`}>
                          {a.status === 'late' ? <Clock className="h-3 w-3" /> : a.status === 'absent' ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                          {STATUS_LABEL[a.status] || a.status}
                        </span>
                        <span className="text-sm text-slate-300">{formatDate(a.date)}</span>
                      </div>
                      {a.note && <span className="text-xs text-slate-400">{a.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Onglet Notes */}
        {tab === 'notes' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
                <p className="text-3xl font-bold text-indigo-400 leading-none">{gradeStats.count > 0 ? gradeStats.average.toFixed(2) : '—'}<span className="text-sm text-slate-500"> /20</span></p>
                <p className="text-xs text-slate-400 mt-1.5">Moyenne générale (période)</p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
                <p className="text-3xl font-bold text-white leading-none">{gradeStats.count}</p>
                <p className="text-xs text-slate-400 mt-1.5">Notes au dossier</p>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-700/60 bg-slate-900/60">
                <h2 className="font-bold text-white text-sm">Derniers devoirs notés</h2>
              </div>
              {grades.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Aucune note enregistrée pour cette période.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="p-4 font-semibold">Matière / Évaluation</th>
                        <th className="p-4 font-semibold">Note</th>
                        <th className="p-4 font-semibold">Coeff.</th>
                        <th className="p-4 font-semibold">Appréciation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60">
                      {grades.slice().reverse().map((g, i) => (
                        <tr key={i} className="hover:bg-slate-700/40">
                          <td className="p-4">
                            <p className="font-medium text-slate-100 text-xs">{g.subject_name || 'Matière'}</p>
                            <p className="text-xs text-slate-400">{g.evaluation_title}</p>
                          </td>
                          <td className="p-4">
                            <span className={`text-sm font-bold ${g.score >= 10 ? 'text-emerald-400' : 'text-rose-400'}`}>{g.score} <span className="text-slate-500 text-xs">/ {g.max_score}</span></span>
                          </td>
                          <td className="p-4 text-slate-400">{g.coefficient}</td>
                          <td className="p-4 text-xs text-slate-400">{g.score >= 16 ? 'Très bien' : g.score >= 14 ? 'Bien' : g.score >= 12 ? 'Assez bien' : g.score >= 10 ? 'Passable' : 'Insuffisant'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Onglet Finances */}
        {tab === 'finances' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
                <p className="text-2xl font-bold text-amber-400 leading-none">{formatMoney(financeStats.due)}</p>
                <p className="text-xs text-slate-400 mt-1.5">Solde restant</p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
                <p className="text-2xl font-bold text-emerald-400 leading-none">{formatMoney(financeStats.paid)}</p>
                <p className="text-xs text-slate-400 mt-1.5">Total réglé</p>
              </div>
            </div>

            {/* Factures en attente */}
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-700/60 bg-slate-900/60">
                <h2 className="font-bold text-white text-sm">Factures en attente</h2>
              </div>
              {invoices.filter((i) => Number(i.amount_due) - Number(i.amount_paid) > 0).length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Aucune facture en attente. Tout est réglé 🎉</div>
              ) : (
                <div className="divide-y divide-slate-700/60">
                  {invoices.filter((i) => Number(i.amount_due) - Number(i.amount_paid) > 0).map((inv) => {
                    const due = Math.max(0, Number(inv.amount_due) - Number(inv.amount_paid));
                    return (
                      <div key={inv.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-100">{inv.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">Échéance : {formatDate(inv.due_date)}</p>
                          <p className="text-xs mt-1"><span className="text-slate-500">Total {formatMoney(Number(inv.amount_due))}</span> <span className="text-amber-400 font-semibold ml-2">Restant {formatMoney(due)}</span></p>
                        </div>
                        <button onClick={() => payInvoice(inv)} disabled={!!payingFor}
                          className="inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-700/60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition">
                          {payingFor?.id === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                          {payingFor?.id === inv.id ? 'Règlement…' : `Régler ${formatMoney(due)}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Historique des reçus */}
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-700/60 bg-slate-900/60">
                <h2 className="font-bold text-white text-sm">Historique des règlements</h2>
              </div>
              {payments.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Aucun paiement enregistré.</div>
              ) : (
                <div className="divide-y divide-slate-700/60">
                  {payments.map((p) => (
                    <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-emerald-400">{formatMoney(Number(p.amount_paid))}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{p.reference || 'Sans référence'} · {formatDate(p.payment_date)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 capitalize">{p.payment_method.replace('_', ' ')}</span>
                        <button onClick={() => downloadReceipt(p)} className="p-2 bg-slate-700/60 hover:bg-slate-600 rounded-lg text-slate-200 transition"><Printer className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info services */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 flex items-center gap-3">
            <UtensilsCrossed className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-sm text-slate-100">Cantine</p>
              <p className="text-xs text-slate-500">Abonnement actif le cas échéant</p>
            </div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 flex items-center gap-3">
            <Bus className="h-5 w-5 text-sky-400" />
            <div>
              <p className="text-sm text-slate-100">Transport</p>
              <p className="text-xs text-slate-500">Circuit scolaire assigné</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
