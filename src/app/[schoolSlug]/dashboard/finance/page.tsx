'use client';

import React, { useEffect, useMemo, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  CreditCard,
  Plus,
  Loader2,
  X,
  Search,
  Receipt,
  Download,
  TrendingUp,
  Wallet,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  FileText,
  Settings2,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';
import { formatMoney, formatDate, todayIso } from '@/lib/format';
import { downloadCashReceipt, paymentMethodLabel, type CashReceiptData } from '@/lib/pdf/cashReceiptPdf';
import { unifyStatus, type InvoiceStatus } from '@/lib/finance';

interface InvoiceRow {
  id: string;
  reference: string;
  title: string;
  amount_due: number;
  amount_paid: number;
  remaining: number;
  due_date: string | null;
  status: InvoiceStatus;
  note: string | null;
  created_at: string | null;
  student: {
    id: string;
    matricule: string;
    first_name: string;
    last_name: string;
    gender: string | null;
    class_name: string | null;
  } | null;
}

interface Kpi {
  total_emitted: number;
  total_collected: number;
  remaining: number;
  recovery_rate: number;
  invoices: number;
  paid: number;
  partial: number;
  overdue: number;
  pending: number;
}

interface ClassRow { id: string; name: string }
interface FeeType { id: string; name: string; amount: number; category: string }

const STATUS_META: Record<InvoiceStatus, { label: string; cls: string; dot: string }> = {
  paid: { label: 'Payée', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  partial: { label: 'Partielle', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' },
  overdue: { label: 'En retard', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30', dot: 'bg-rose-400' },
  pending: { label: 'En attente', cls: 'text-slate-300 bg-slate-600/30 border-slate-500/40', dot: 'bg-slate-400' },
};

const PAYMENT_METHODS = ['cash', 'check', 'bank_transfer', 'mobile_money'];

export default function FinancePage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [role, setRole] = useState('');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [kpis, setKpis] = useState<Kpi | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [reloadKey, setReloadKey] = useState(0);

  // Modale émettre une facture
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [issueMode, setIssueMode] = useState<'single' | 'class'>('single');
  const [issueStudent, setIssueStudent] = useState('');
  const [issueClass, setIssueClass] = useState('');
  const [issueFeeType, setIssueFeeType] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueAmount, setIssueAmount] = useState('');
  const [issueDue, setIssueDue] = useState('');
  const [issueSaving, setIssueSaving] = useState(false);
  const [studentsForIssue, setStudentsForIssue] = useState<{ id: string; first_name: string; last_name: string; matricule: string }[]>([]);

  // Modale encaissement
  const [payTarget, setPayTarget] = useState<InvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payDate, setPayDate] = useState(todayIso());
  const [payNote, setPayNote] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<CashReceiptData | null>(null);

  const isReadOnly = role === 'teacher';

  const loadDashboard = useCallback(async (sid: string) => {
    const res = await fetch(`/api/school/finance/dashboard?schoolId=${encodeURIComponent(sid)}`, { cache: 'no-store' });
    const payload = res.ok ? await res.json().catch(() => null) : null;
    if (payload) {
      setKpis(payload.kpis);
      setInvoices(payload.invoices || []);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: schoolData } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (!schoolData) { if (!cancelled) setLoading(false); return; }
      setSchool(schoolData);
      setSchoolId(schoolData.id);

      let currentRole = '';
      if (user) {
        const { data: profileData } = await supabase.from('user_profiles').select('role').eq('user_id', user.id).maybeSingle();
        currentRole = profileData?.role ?? '';
      }
      setRole(currentRole);

      await loadDashboard(schoolData.id);

      const [{ data: classesData }, { data: studentsData }, feeRes] = await Promise.all([
        supabase.from('classes').select('id, name').eq('school_id', schoolData.id).order('name'),
        supabase.from('students').select('id, first_name, last_name, matricule').eq('school_id', schoolData.id).eq('status', 'active').order('last_name'),
        fetch(`/api/school/finance/fee-types?schoolId=${encodeURIComponent(schoolData.id)}`, { cache: 'no-store' }),
      ]);
      const feePayload = feeRes.ok ? await feeRes.json().catch(() => null) : null;

      if (!cancelled) {
        if (classesData) setClasses(classesData as ClassRow[]);
        if (studentsData) setStudentsForIssue(studentsData as { id: string; first_name: string; last_name: string; matricule: string }[]);
        setFeeTypes(feePayload?.fee_types || []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [schoolSlug, supabase, reloadKey, loadDashboard]);

  useEffect(() => {
    if (schoolId) void loadDashboard(schoolId);
  }, [schoolId, reloadKey, loadDashboard]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      const matchSearch =
        !q ||
        inv.reference.toLowerCase().includes(q) ||
        inv.title.toLowerCase().includes(q) ||
        `${inv.student?.first_name} ${inv.student?.last_name} ${inv.student?.matricule}`.toLowerCase().includes(q);
      const matchStatus = filterStatus === 'ALL' || inv.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [invoices, search, filterStatus]);

  // ── Émettre une facture ──
  function selectedFee(): FeeType | undefined {
    return feeTypes.find((f) => f.id === issueFeeType);
  }

  useEffect(() => {
    const fee = selectedFee();
    setIssueTitle(fee?.name || '');
    if (issueAmount === '') setIssueAmount(fee ? String(fee.amount) : '');
  }, [issueFeeType]);

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    setIssueSaving(true);
    try {
      const body: Record<string, unknown> = {
        mode: issueMode,
        fee_type_id: issueFeeType || undefined,
        title: issueTitle || undefined,
        amount: issueAmount !== '' ? Number(issueAmount) : undefined,
        due_date: issueDue || undefined,
      };
      if (issueMode === 'single') body.student_id = issueStudent;
      else body.class_id = issueClass;

      const res = await fetch(`/api/school/finance/invoices?schoolId=${encodeURIComponent(schoolId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) { push('error', payload?.error || 'Émission impossible.'); return; }
      push('success', `${payload.issued} facture(s) émise(s).`);
      setIsIssueOpen(false);
      resetIssue();
      setReloadKey((k) => k + 1);
    } catch {
      push('error', 'Erreur réseau.');
    } finally {
      setIssueSaving(false);
    }
  }

  function resetIssue() {
    setIssueStudent('');
    setIssueClass('');
    setIssueFeeType('');
    setIssueTitle('');
    setIssueAmount('');
    setIssueDue('');
  }

  // ── Encaissement ──
  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget || !schoolId) return;
    setPaySaving(true);
    try {
      const res = await fetch(`/api/school/payments?schoolId=${encodeURIComponent(schoolId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: payTarget.id,
          amount_paid: Number(payAmount),
          payment_method: payMethod,
          payment_date: payDate,
          note: payNote || null,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) { push('error', payload?.error || 'Encaissement impossible.'); return; }

      const receiptNo = payload.payment?.receipt_no || `${payTarget.reference}-R1`;
      const receipt: CashReceiptData = {
        receiptRef: receiptNo,
        schoolName: school?.name || 'École',
        schoolAddress: school?.address ?? null,
        schoolPhone: school?.phone ?? null,
        schoolEmail: school?.email ?? null,
        schoolLogoUrl: school?.logo_url ?? null,
        primaryColor: school?.primary_color || '#0F766E',
        studentMatricule: payTarget.student?.matricule || '',
        studentName: payTarget.student ? `${payTarget.student.first_name} ${payTarget.student.last_name}` : '—',
        className: payTarget.student?.class_name || '',
        invoiceReference: payTarget.reference,
        invoiceTitle: payTarget.title,
        amountPaid: Number(payAmount),
        amountDue: payTarget.amount_due,
        remainingDue: payload.payment?.remaining ?? Math.max(0, payTarget.remaining - Number(payAmount)),
        paymentMethod: paymentMethodLabel(payMethod),
        paymentDate: formatDate(payDate),
        operator: 'Caisse',
        academicYear: '2026-2027',
      };
      setLastReceipt(receipt);
      downloadCashReceipt(receipt);

      push('success', `Encaissement de ${formatMoney(Number(payAmount))} enregistré.`);
      setPayTarget(null);
      setPayAmount('');
      setPayNote('');
      setPayDate(todayIso());
      setReloadKey((k) => k + 1);
    } catch {
      push('error', 'Erreur réseau.');
    } finally {
      setPaySaving(false);
    }
  }

  function openPay(inv: InvoiceRow) {
    setPayTarget(inv);
    setPayAmount(inv.remaining > 0 ? String(inv.remaining) : '');
  }

  const selectedInvoiceStudentName = payTarget?.student
    ? `${payTarget.student.first_name} ${payTarget.student.last_name}`
    : '';

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center flex items-center justify-center gap-2 text-slate-400 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de la facturation…
      </div>
    );
  }

  const kpiCards = [
    { label: 'Total émis', value: kpis?.total_emitted ?? 0, icon: FileText, color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
    { label: 'Encaissé', value: kpis?.total_collected ?? 0, icon: Banknote, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    { label: 'Reste à recouvrer', value: kpis?.remaining ?? 0, icon: Wallet, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    { label: 'Taux de recouvrement', value: `${kpis?.recovery_rate ?? 0}%`, icon: TrendingUp, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <DashToastStack toasts={toasts} onDismiss={dismiss} />

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
              <CreditCard className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Facturation & Encaissement</h1>
              <p className="text-sm text-slate-400 mt-0.5">Émettez vos factures et encaissez les paiements.</p>
            </div>
          </div>
        </div>
        {!isReadOnly && (
          <div className="flex items-center gap-2">
            <Link
              href={`/${schoolSlug}/dashboard/finance/tarifs`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 transition"
            >
              <Settings2 className="h-4 w-4" />
              Grilles tarifaires
            </Link>
            <button
              onClick={() => setIsIssueOpen(true)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition"
            >
              <Plus className="h-4 w-4" />
              Émettre une facture
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpiCards.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className={`bg-slate-800/60 border ${k.color.split(' ').slice(-1)[0]} rounded-2xl p-4 shadow-lg`}>
              <div className={`inline-flex p-2 rounded-xl border ${k.color} mb-3`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold text-white leading-none">{k.value}</p>
              <p className="text-xs text-slate-400 mt-1.5">{k.label}</p>
            </div>
          );
        })}
      </div>

      {/* Mini distribution statuts */}
      {kpis && (
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Répartition</span>
            {(['pending', 'partial', 'paid', 'overdue'] as InvoiceStatus[]).map((s) => {
              const m = STATUS_META[s];
              return (
                <span key={s} className="inline-flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                  <span className="text-slate-300 capitalize">{m.label}</span>
                  <span className="font-bold text-white">{kpis[s]}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Barre filtres */}
      <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-3 shadow-lg space-y-3">
        <div className="flex gap-3 flex-col lg:flex-row lg:items-center">
          <div className="flex-1 flex items-center gap-2 bg-slate-900/70 border border-slate-700 rounded-xl px-3">
            <Search className="h-4 w-4 text-slate-500 shrink-0" />
            <input
              type="text"
              placeholder="Rechercher par n° de facture, élève ou intitulé…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full py-2.5 text-sm outline-none bg-transparent text-slate-100 placeholder-slate-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm bg-slate-900/70 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 font-medium outline-none"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="partial">Partielle</option>
            <option value="paid">Payée</option>
            <option value="overdue">En retard</option>
          </select>
        </div>
      </div>

      {/* Tableau des factures */}
      <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Receipt className="h-10 w-10 text-slate-600 mx-auto" />
            <p className="text-slate-200 font-medium text-sm">Aucune facture trouvée.</p>
            <p className="text-xs text-slate-400">Cliquez sur « Émettre une facture » pour commencer.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">N° Facture</th>
                  <th className="px-4 py-3 font-semibold">Élève & Classe</th>
                  <th className="px-4 py-3 font-semibold text-right">Montant dû</th>
                  <th className="px-4 py-3 font-semibold text-right">Payé</th>
                  <th className="px-4 py-3 font-semibold text-right">Reste dû</th>
                  <th className="px-4 py-3 font-semibold">Échéance</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filtered.map((inv) => {
                  const statusMeta = STATUS_META[unifyStatus(inv.status)];
                  const surplus = inv.amount_due > 0 && inv.remaining <= 0;
                  return (
                    <tr key={inv.id} className="hover:bg-slate-700/40">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-slate-700/60 border border-slate-600 text-slate-200 px-2 py-1 rounded-md">{inv.reference}</span>
                        <p className="text-[11px] text-slate-400 mt-1 truncate max-w-[180px]">{inv.title}</p>
                      </td>
                      <td className="px-4 py-3">
                        {inv.student ? (
                          <>
                            <p className="font-semibold text-white">{inv.student.first_name} {inv.student.last_name}</p>
                            <p className="text-xs text-slate-400">{inv.student.matricule} · {inv.student.class_name || 'Sans classe'}</p>
                          </>
                        ) : (
                          <span className="text-slate-500 text-xs">Élève supprimé</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-100 font-medium">{formatMoney(inv.amount_due)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-medium">{formatMoney(inv.amount_paid)}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-medium">{formatMoney(inv.remaining)}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{formatDate(inv.due_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${statusMeta.cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isReadOnly && !surplus && (
                          <button
                            onClick={() => openPay(inv)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1.5 rounded-lg transition"
                          >
                            <Banknote className="h-3.5 w-3.5" />
                            Encaisser
                          </button>
                        )}
                        {surplus && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Soldée
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale : émettre une facture */}
      {isIssueOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="font-bold text-white">Émettre une facture</h3>
              <button onClick={() => setIsIssueOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleIssue} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIssueMode('single')}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition ${issueMode === 'single' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-slate-500'}`}
                  >
                    Un élève
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssueMode('class')}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition ${issueMode === 'class' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-slate-500'}`}
                  >
                    Toute une classe
                  </button>
                </div>
              </div>

              {issueMode === 'single' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Élève *</label>
                  <select required value={issueStudent} onChange={(e) => setIssueStudent(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none">
                    <option value="">Sélectionner un élève…</option>
                    {studentsForIssue.map((s) => (
                      <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.matricule})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Classe *</label>
                  <select required value={issueClass} onChange={(e) => setIssueClass(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none">
                    <option value="">Sélectionner une classe…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">Facture générée pour tous les élèves actifs de la classe.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Type de frais</label>
                <select value={issueFeeType} onChange={(e) => setIssueFeeType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none">
                  <option value="">Libellé libre…</option>
                  {feeTypes.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} — {formatMoney(f.amount)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Intitulé *</label>
                  <input required value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Montant (FCFA) *</label>
                  <input required type="number" min={0} value={issueAmount} onChange={(e) => setIssueAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Date d&apos;échéance</label>
                <input type="date" value={issueDue} onChange={(e) => setIssueDue(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
                <button type="button" onClick={() => setIsIssueOpen(false)}
                  className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-xl font-medium transition">
                  Annuler
                </button>
                <button type="submit" disabled={issueSaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-700/60 text-white rounded-xl font-medium shadow-sm transition">
                  {issueSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {issueSaving ? 'Émission…' : 'Émettre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale : encaissement */}
      {payTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-emerald-400" />
                <h3 className="font-bold text-white">Encaisser un paiement</h3>
              </div>
              <button onClick={() => setPayTarget(null)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-1">
              <p className="text-sm font-semibold text-white">{selectedInvoiceStudentName}</p>
              <p className="text-xs text-slate-400 font-mono">{payTarget.reference} · {payTarget.title}</p>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-400">Reste dû</span>
                <span className="font-bold text-amber-400">{formatMoney(payTarget.remaining)}</span>
              </div>
            </div>

            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Montant (FCFA) *</label>
                <input required type="number" min={1} step="any" value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Moyen de paiement *</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayMethod(m)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-medium border transition ${payMethod === m ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-slate-500'}`}
                    >
                      {paymentMethodLabel(m)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Date</label>
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Référence / Note</label>
                  <input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Ex : chèque n°…"
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 flex items-center gap-2 text-xs text-slate-400">
                <Receipt className="h-4 w-4 text-emerald-400 shrink-0" />
                Un reçu de caisse officiel sera imprimé automatiquement après l&apos;encaissement.
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-700">
                <button type="button" onClick={() => setPayTarget(null)}
                  className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-xl font-medium transition">
                  Annuler
                </button>
                <button type="submit" disabled={paySaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-700/60 text-white rounded-xl font-medium shadow-sm transition">
                  {paySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  {paySaving ? 'Encaissement…' : 'Encaisser & imprimer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bannière reçu récent */}
      {lastReceipt && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-4 max-w-sm space-y-2">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold text-white">Paiement enregistré</span>
          </div>
          <p className="text-xs text-slate-400">Reçu <span className="font-mono text-slate-200">{lastReceipt.receiptRef}</span> téléchargé.</p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => downloadCashReceipt(lastReceipt)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded-lg transition"
            >
              <Download className="h-3.5 w-3.5" />
              Réimprimer
            </button>
            <button onClick={() => setLastReceipt(null)} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5">
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
