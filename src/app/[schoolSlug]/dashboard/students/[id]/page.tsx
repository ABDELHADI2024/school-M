'use client';

import React, { useEffect, useMemo, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeft,
  User,
  Users,
  BookOpen,
  CreditCard,
  Pencil,
  RefreshCw,
  FileText,
  Loader2,
  Phone,
  Mail,
  MapPin,
  CalendarDays,
  Stethoscope,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  X,
  GraduationCap,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';
import { downloadSchoolCertificate } from '@/lib/pdf/schoolCertificatePdf';

interface StudentFull {
  id: string;
  school_id: string | null;
  matricule: string;
  first_name: string;
  last_name: string;
  gender: string;
  birth_date: string | null;
  address: string | null;
  medical_notes: string | null;
  remarks: string | null;
  status: string;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  parent_user_id: string | null;
  class_id: string | null;
  classes?: { name: string; level: string; main_teacher_id: string | null } | null;
}

interface AttendanceRow {
  id: string;
  date: string;
  status: string;
  note: string | null;
}

interface GradeRow {
  id: string;
  score: number | null;
  coefficient: number | null;
  comment: string | null;
  evaluations?:
    | {
        title: string;
        term: string | null;
        max_score: number | null;
        evaluation_date: string | null;
        subjects?: { name: string; code: string | null; default_color: string | null } | Array<{ name: string; code: string | null; default_color: string | null }> | null;
      }
    | Array<{
        title: string;
        term: string | null;
        max_score: number | null;
        evaluation_date: string | null;
        subjects?: { name: string; code: string | null; default_color: string | null } | Array<{ name: string; code: string | null; default_color: string | null }> | null;
      }>
    | null;
}

interface InvoiceRow {
  id: string;
  title: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  due_date: string | null;
}

interface ProfileRow {
  full_name: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  active: { label: 'Inscrit', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  suspended: { label: 'Radié', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', dot: 'bg-rose-400' },
  inactive: { label: 'En attente', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
};

const TABS = [
  { id: 'info', label: 'Informations', icon: User },
  { id: 'parents', label: 'Parents & Tuteur', icon: Users },
  { id: 'parcours', label: 'Scolarité & Absences', icon: BookOpen },
  { id: 'finance', label: 'Finance & Écolage', icon: CreditCard },
] as const;

type TabId = (typeof TABS)[number]['id'];

const INITIAL_FORM = {
  first_name: '',
  last_name: '',
  gender: 'M',
  birth_date: '',
  address: '',
  medical_notes: '',
  remarks: '',
  status: 'active',
  parent_name: '',
  parent_phone: '',
  parent_email: '',
};

export default function StudentDetailPage({ params }: { params: Promise<{ schoolSlug: string; id: string }> }) {
  const resolved = use(params);
  const schoolSlug = resolved.schoolSlug;
  const studentId = resolved.id;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<{ id: string; name: string; primary_color: string; address: string | null; phone: string | null; email: string | null } | null>(null);
  const [student, setStudent] = useState<StudentFull | null>(null);
  const [role, setRole] = useState<string>('');
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabId>('info');

  // Modale changer de classe
  const [classOpen, setClassOpen] = useState(false);
  const [newClassId, setNewClassId] = useState('');
  const [classSaving, setClassSaving] = useState(false);

  // Modale modifier
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [editSaving, setEditSaving] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  const isReadOnly = role === 'teacher';
  const financeEnabled = activeModules.includes('cashbox') || activeModules.includes('finance');
  const currentClass = student?.classes?.name || '';
  const primary = school?.primary_color || '#6366f1';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const schoolRes = await supabase
        .from('schools')
        .select('id, name, primary_color, address, phone, email')
        .eq('slug', schoolSlug)
        .single();
      const schoolData = schoolRes.data;
      if (!schoolData) return setNotFound(true);

      let currentRole = '';
      if (user) {
        const { data: p } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        currentRole = p?.role ?? '';
      }

      const studentRes = await supabase
        .from('students')
        .select('*, classes(name, level, main_teacher_id)')
        .eq('id', studentId)
        .maybeSingle();
      const studentData = studentRes.data as StudentFull | null;
      if (!studentData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const [modulesRes, attRes, gradRes, invRes, classesRes, profileRes] = await Promise.all([
        fetch(`/api/school/modules?schoolId=${encodeURIComponent(schoolData.id)}`).then((r) => r.json().catch(() => ({ modules: [] as string[] }))).catch(() => ({ modules: [] as string[] })),
        supabase.from('attendance').select('id, date, status, note').eq('student_id', studentId).order('date', { ascending: false }).limit(10),
        supabase.from('grades').select('id, score, coefficient, comment, evaluations(title, term, max_score, evaluation_date, subjects(name, code, default_color))').eq('student_id', studentId),
        supabase.from('invoices').select('id, title, amount_due, amount_paid, status, due_date').eq('student_id', studentId).order('due_date', { ascending: true }),
        supabase.from('classes').select('id, name').eq('school_id', schoolData.id).order('name'),
        user && studentData.parent_user_id ? supabase.from('user_profiles').select('full_name').eq('user_id', studentData.parent_user_id).maybeSingle() : Promise.resolve({ data: null as ProfileRow | null }),
      ]);

      setSchool(schoolData);
      setStudent(studentData);
      setRole(currentRole);
      setActiveModules((modulesRes.modules || []) as string[]);
      setAttendance((attRes.data || []) as AttendanceRow[]);
      setGrades((gradRes.data || []) as GradeRow[]);
      setInvoices((invRes.data || []) as InvoiceRow[]);
      if (classesRes.data) setClasses(classesRes.data as { id: string; name: string }[]);
      if (profileRes.data) setProfileName(profileRes.data.full_name);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [schoolSlug, studentId, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData, reloadKey]);

  function openEdit() {
    if (!student) return;
    setForm({
      first_name: student.first_name,
      last_name: student.last_name,
      gender: student.gender?.toUpperCase() || 'M',
      birth_date: student.birth_date || '',
      address: student.address || '',
      medical_notes: student.medical_notes || '',
      remarks: student.remarks || '',
      status: student.status || 'active',
      parent_name: student.parent_name || '',
      parent_phone: student.parent_phone || '',
      parent_email: student.parent_email || '',
    });
    setEditOpen(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          gender: form.gender.toUpperCase(),
          birth_date: form.birth_date || null,
          address: form.address.trim() || null,
          medical_notes: form.medical_notes.trim() || null,
          remarks: form.remarks.trim() || null,
          status: form.status,
          parent_name: form.parent_name.trim() || null,
          parent_phone: form.parent_phone.trim() || null,
          parent_email: form.parent_email.trim() || null,
        })
        .eq('id', studentId);
      if (error) throw error;
      push('success', 'Élève mis à jour.');
      setEditOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleChangeClass(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId || !newClassId) return;
    setClassSaving(true);
    try {
      const { error } = await supabase.from('students').update({ class_id: newClassId }).eq('id', studentId);
      if (error) throw error;
      push('success', 'Classe mise à jour.');
      setClassOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Modification impossible.');
    } finally {
      setClassSaving(false);
    }
  }

  function handleCertificate() {
    if (!student || !school) return;
    downloadSchoolCertificate({
      studentLastName: student.last_name,
      studentFirstName: student.first_name,
      matricule: student.matricule,
      birthDate: student.birth_date,
      className: currentClass,
      academicYear: '2026-2027',
      schoolName: school.name,
      schoolAddress: school.address,
      schoolPhone: school.phone,
      schoolEmail: school.email,
      primaryColor: school.primary_color,
      issuedDate: new Date().toLocaleDateString('fr-FR'),
    });
    push('success', 'Certificat de scolarité généré.');
  }

  const age = useMemo(() => {
    if (!student?.birth_date) return null;
    const birth = new Date(student.birth_date);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let yrs = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) yrs--;
    return yrs;
  }, [student?.birth_date]);

  const financialSummary = useMemo(() => {
    const paid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount_paid), 0);
    const totalDue = invoices.reduce((s, i) => s + Number(i.amount_due), 0);
    const remaining = invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + (Number(i.amount_due) - Number(i.amount_paid)), 0);
    const paidCount = invoices.filter((i) => i.status === 'paid').length;
    const pendingCount = invoices.filter((i) => i.status !== 'paid').length;
    return { paid, totalDue, remaining, paidCount, pendingCount, hasOverdue: invoices.some((i) => i.status === 'overdue') };
  }, [invoices]);

  const subjectAverages = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; total: number; count: number; coeffSum: number; coeffWeighted: number; latestComment: string | null }>();
    grades.forEach((g) => {
      const ev = Array.isArray(g.evaluations) ? g.evaluations[0] : g.evaluations;
      const subRaw = ev?.subjects;
      const sub = Array.isArray(subRaw) ? subRaw[0] : subRaw;
      const name = sub?.name || 'Sans matière';
      if (!map.has(name)) {
        map.set(name, { name, color: sub?.default_color || null, total: 0, count: 0, coeffSum: 0, coeffWeighted: 0, latestComment: null });
      }
      const entry = map.get(name)!;
      const coeff = g.coefficient ?? 1;
      if (g.score !== null) {
        entry.total += g.score * coeff;
        entry.coeffWeighted += coeff;
        entry.count++;
      }
      entry.coeffSum += coeff;
      if (g.comment) entry.latestComment = g.comment;
    });
    const list = [...map.values()].map((m) => ({ ...m, avg: m.count > 0 ? m.coeffWeighted / m.count : null }));
    list.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
    return list;
  }, [grades]);

  const overallAverage = useMemo(() => {
    const valid = subjectAverages.filter((s) => s.avg !== null);
    if (valid.length === 0) return null;
    return valid.reduce((s, sub) => s + sub.avg! * sub.coeffSum, 0) / valid.reduce((s, sub) => s + sub.coeffSum, 0);
  }, [subjectAverages]);

  const absences = useMemo(() => {
    return attendance.filter((a) => a.status && !['present', 'late', 'excused'].includes(a.status));
  }, [attendance]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center flex items-center justify-center gap-2 text-slate-400 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de la fiche élève…
      </div>
    );
  }

  if (notFound || !student) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-slate-500 mx-auto" />
        <p className="text-slate-300 font-medium">Élève introuvable ou accès non autorisé.</p>
        <Link href={`/${schoolSlug}/dashboard/students`} className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 font-medium">
          <ArrowLeft className="h-4 w-4" />
          Retour aux inscriptions
        </Link>
      </div>
    );
  }

  const statusMeta = STATUS_META[student.status || 'active'] || STATUS_META.active;
  const isGirl = student.gender?.toUpperCase() === 'F';
  const genderCls = isGirl ? 'from-pink-500 to-rose-500' : 'from-blue-500 to-indigo-500';
  const avatarBg = `bg-gradient-to-br ${genderCls}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <DashToastStack toasts={toasts} onDismiss={dismiss} />

      {/* Fil d'ariane + retour */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Link href={`/${schoolSlug}/dashboard/students`} className="inline-flex items-center gap-1.5 hover:text-indigo-400 transition font-medium">
            <ArrowLeft className="h-4 w-4" />
            Élèves
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-slate-200 font-medium">Fiche élève</span>
        </div>
      </div>

      {/* En-tête profil — dark */}
      <div className="relative bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
        <div className={`h-24 bg-gradient-to-r opacity-90`} style={{ backgroundImage: `linear-gradient(90deg, ${primary}, #7c3aed)` }} />
        <div className="px-6 pb-6 -mt-14 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="flex items-end gap-4 min-w-0">
            <div className={`relative h-24 w-24 shrink-0 rounded-2xl ${avatarBg} text-white flex items-center justify-center text-3xl font-bold ring-4 ring-slate-800 shadow-xl`}>
              {(student.first_name[0] || '') + (student.last_name[0] || '')}
              <span className={`absolute -bottom-2 -right-2 h-8 w-8 rounded-xl flex items-center justify-center text-xs font-black ring-2 ring-slate-800 ${isGirl ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white'}`}>
                {isGirl ? 'F' : 'M'}
              </span>
            </div>
            <div className="pb-1 space-y-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-white truncate">{student.first_name} {student.last_name}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${statusMeta.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
                  {statusMeta.label}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-mono text-xs bg-slate-700/60 border border-slate-600 text-slate-200 px-2 py-0.5 rounded-md">{student.matricule}</span>
                {currentClass && (
                  <span className="inline-flex items-center gap-1 font-semibold text-violet-200 bg-violet-500/15 border border-violet-500/30 px-2.5 py-0.5 rounded-lg">
                    <GraduationCap className="h-3.5 w-3.5" /> {currentClass}
                  </span>
                )}
                <span className="text-slate-400">{isGirl ? 'Fille' : 'Garçon'}</span>
              </div>
            </div>
          </div>

          {!isReadOnly && (
            <div className="flex items-center gap-2 pb-1 flex-wrap shrink-0">
              <button
                onClick={openEdit}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition shadow-lg"
                style={{ backgroundColor: primary }}
              >
                <Pencil className="h-4 w-4" />
                Modifier l'élève
              </button>
              <button
                onClick={() => { setNewClassId(student.class_id || ''); setClassOpen(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-200 bg-slate-700/60 border border-slate-600 hover:bg-slate-700 transition"
              >
                <RefreshCw className="h-4 w-4" />
                Changer de classe
              </button>
              <button
                onClick={handleCertificate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition"
              >
                <FileText className="h-4 w-4" />
                Certificat PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="border-b border-slate-700 px-4 overflow-x-auto">
          <nav className="flex gap-1 min-w-max">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active ? 'text-white border-indigo-400' : 'text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-indigo-400' : ''}`} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {/* ── Onglet Informations ── */}
          {tab === 'info' && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <DarkCard icon={CalendarDays} label="Date de naissance" value={student.birth_date ? new Date(student.birth_date).toLocaleDateString('fr-FR') : '—'} />
              <DarkCard icon={User} label="Âge" value={age !== null ? `${age} ans` : '—'} />
              <DarkCard icon={User} label="Genre" value={isGirl ? 'Féminin' : 'Masculin'} />
              <DarkCard icon={MapPin} label="Adresse" value={student.address || '—'} full />
              <DarkCard icon={Stethoscope} label="Remarques médicales" value={student.medical_notes || 'Aucune information médicale'} full />
              <DarkCard icon={AlertCircle} label="Remarques générales" value={student.remarks || '—'} full />
            </div>
          )}

          {/* ── Onglet Parents & Tuteur ── */}
          {tab === 'parents' && (
            <div className="max-w-3xl space-y-4">
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" />
                  <h3 className="font-bold text-white">Tuteur principal</h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Nom complet</p>
                    <p className="text-slate-100 font-medium">{student.parent_name || 'Non renseigné'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Téléphone</p>
                    {student.parent_phone ? (
                      <a href={`tel:${student.parent_phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 text-indigo-300 hover:text-indigo-200 font-medium">
                        <Phone className="h-3.5 w-3.5" />
                        {student.parent_phone}
                      </a>
                    ) : <p className="text-slate-500">—</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Email</p>
                    {student.parent_email ? (
                      <a href={`mailto:${student.parent_email}`} className="inline-flex items-center gap-1.5 text-indigo-300 hover:text-indigo-200 font-medium break-all">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        {student.parent_email}
                      </a>
                    ) : <p className="text-slate-500">—</p>}
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Compte portail parent</p>
                  {student.parent_user_id ? (
                    <p className="text-slate-200 font-medium text-sm">Compte lié{profileName ? ` — ${profileName}` : ''}</p>
                  ) : (
                    <p className="text-sm text-slate-500">Aucun compte usager associé</p>
                  )}
                </div>
                {student.parent_user_id ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Lié au compte parent
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-600 bg-slate-700/50 text-slate-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Compte non activé
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Onglet Scolarité & Absences ── */}
          {tab === 'parcours' && (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                <DarkStat label="Moyenne générale" value={overallAverage !== null ? `${overallAverage.toFixed(2)} / 20` : '—'} tone="indigo" />
                <DarkStat label="Absences récentes" value={String(absences.length)} tone="rose" />
                <DarkStat label="Matières évaluées" value={String(subjectAverages.length)} tone="emerald" />
              </div>

              <div>
                <h3 className="font-bold text-white mb-3">Moyennes par matière</h3>
                {subjectAverages.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune évaluation enregistrée pour cet élève.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {subjectAverages.map((s) => (
                      <div key={s.name} className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/80 rounded-xl px-4 py-2.5">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color || '#6366f1' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{s.name}</p>
                          {s.latestComment && <p className="text-xs text-slate-500 truncate">{s.latestComment}</p>}
                        </div>
                        {s.avg !== null ? (
                          <span className={`font-bold text-sm ${s.avg >= 10 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.avg.toFixed(2)}</span>
                        ) : <span className="text-slate-500 text-sm">—</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-bold text-white mb-3">Présences & absences récentes</h3>
                {attendance.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun émargement enregistré pour cet élève.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-700/80 rounded-xl">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Date</th>
                          <th className="px-4 py-2.5 font-semibold">Statut</th>
                          <th className="px-4 py-2.5 font-semibold">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {attendance.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-900/40">
                            <td className="px-4 py-2.5 text-slate-200">{new Date(a.date).toLocaleDateString('fr-FR')}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold border ${
                                a.status === 'present' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                                a.status === 'late' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                                a.status === 'excused' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' :
                                'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              }`}>
                                {a.status === 'present' ? 'Présent' : a.status === 'late' ? 'Retard' : a.status === 'excused' ? 'Absence excusée' : 'Absent'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-400 text-xs">{a.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Onglet Finance & Écolage ── */}
          {tab === 'finance' && (
            financeEnabled ? (
              <div className="space-y-6">
                <div className="grid sm:grid-cols-3 gap-4">
                  <DarkStat label="Montant total dû" value={fmtCurrency(financialSummary.totalDue)} tone="slate" />
                  <DarkStat label="Montant payé" value={fmtCurrency(financialSummary.paid)} tone="emerald" sub={`${financialSummary.paidCount} échéance(s) réglée(s)`} />
                  <DarkStat label="Solde restant" value={fmtCurrency(financialSummary.remaining)} tone={financialSummary.hasOverdue ? 'rose' : 'amber'} sub={financialSummary.hasOverdue ? '⚠ Échéances en retard' : `${financialSummary.pendingCount} échéance(s) en attente`} />
                </div>

                {invoices.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune échéance enregistrée pour cet élève.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-700/80 rounded-xl">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Intitulé</th>
                          <th className="px-4 py-2.5 font-semibold">Total</th>
                          <th className="px-4 py-2.5 font-semibold">Payé</th>
                          <th className="px-4 py-2.5 font-semibold">Solde</th>
                          <th className="px-4 py-2.5 font-semibold">Échéance</th>
                          <th className="px-4 py-2.5 font-semibold">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {invoices.map((inv) => {
                          const remaining = Number(inv.amount_due) - Number(inv.amount_paid);
                          return (
                            <tr key={inv.id} className="hover:bg-slate-900/40">
                              <td className="px-4 py-2.5 text-slate-100 font-medium">{inv.title}</td>
                              <td className="px-4 py-2.5 text-slate-300">{fmtCurrency(Number(inv.amount_due))}</td>
                              <td className="px-4 py-2.5 text-emerald-400">{fmtCurrency(Number(inv.amount_paid))}</td>
                              <td className="px-4 py-2.5">{remaining > 0 ? <span className="text-slate-200 font-medium">{fmtCurrency(remaining)}</span> : <span className="text-emerald-400">—</span>}</td>
                              <td className="px-4 py-2.5 text-slate-400 text-xs">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('fr-FR') : '—'}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold border ${
                                  inv.status === 'paid' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                                  inv.status === 'partial' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                                  inv.status === 'overdue' ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' :
                                  'bg-slate-600/40 text-slate-300 border-slate-600'
                                }`}>
                                  {inv.status === 'paid' ? 'Payé' : inv.status === 'partial' ? 'Partiel' : inv.status === 'overdue' ? 'En retard' : 'En attente'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 space-y-2">
                <CreditCard className="h-10 w-10 text-slate-500 mx-auto" />
                <p className="text-sm text-slate-400">Le module financier n'est pas activé pour votre compte.</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Modale modifier l'élève */}
      {editOpen && (
        <Modal title="Modifier l'élève" onClose={() => setEditOpen(false)}>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="Nom *" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} required />
              <TextField label="Prénom *" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Genre</Label>
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={selectCls}>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
              <div>
                <Label>Statut</Label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectCls}>
                  <option value="active">Inscrit</option>
                  <option value="inactive">En attente</option>
                  <option value="suspended">Radié</option>
                </select>
              </div>
            </div>
            <TextField label="Date de naissance" value={form.birth_date} onChange={(v) => setForm({ ...form, birth_date: v })} type="date" />
            <TextField label="Adresse" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            <TextField label="Remarques médicales" value={form.medical_notes} onChange={(v) => setForm({ ...form, medical_notes: v })} textarea />
            <TextField label="Remarques générales" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} textarea />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="Nom du tuteur" value={form.parent_name} onChange={(v) => setForm({ ...form, parent_name: v })} />
              <TextField label="Téléphone tuteur" value={form.parent_phone} onChange={(v) => setForm({ ...form, parent_phone: v })} />
            </div>
            <TextField label="Email tuteur" value={form.parent_email} onChange={(v) => setForm({ ...form, parent_email: v })} type="email" />
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
              <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 rounded-xl font-medium transition">Annuler</button>
              <button type="submit" disabled={editSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-white rounded-xl font-medium shadow-lg transition disabled:opacity-50"
                style={{ backgroundColor: primary }}>
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modale changer de classe */}
      {classOpen && (
        <Modal title="Changer de classe" onClose={() => setClassOpen(false)}>
          <form onSubmit={handleChangeClass} className="space-y-4">
            <div>
              <Label>Classe actuelle</Label>
              <p className="text-slate-200 font-medium">{currentClass || 'Aucune'}</p>
            </div>
            <div>
              <Label>Nouvelle classe</Label>
              <select value={newClassId} onChange={(e) => setNewClassId(e.target.value)} className={selectCls}>
                <option value="">Sans classe</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
              <button type="button" onClick={() => setClassOpen(false)} className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 rounded-xl font-medium transition">Annuler</button>
              <button type="submit" disabled={classSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-500 rounded-xl font-medium shadow-lg transition">
                {classSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {classSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ── Composants UI dark réutilisables ── */

function fmtCurrency(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 });
}

const selectCls = 'w-full px-3.5 py-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500';

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{children}</label>;
}

function TextField({ label, value, onChange, type = 'text', required, textarea }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; textarea?: boolean }) {
  const base = 'w-full px-3.5 py-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500';
  return (
    <div>
      <Label>{label}</Label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={base} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} className={base} />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl my-8 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <h3 className="font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DarkCard({ icon: Icon, label, value, full }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; full?: boolean }) {
  return (
    <div className={`bg-slate-900/60 border border-slate-700/80 rounded-xl p-4 ${full ? 'sm:col-span-2 lg:col-span-2' : ''}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
        <Icon className="h-3.5 w-3.5 text-indigo-400" />
        {label}
      </p>
      <p className="text-slate-100 font-medium text-sm break-words">{value}</p>
    </div>
  );
}

const TONE_MAP = {
  indigo: { bg: 'bg-indigo-500/15 border-indigo-500/30', text: 'text-indigo-300' },
  rose: { bg: 'bg-rose-500/15 border-rose-500/30', text: 'text-rose-300' },
  emerald: { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-300' },
  amber: { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-300' },
  slate: { bg: 'bg-slate-700/40 border-slate-600', text: 'text-slate-200' },
} as const;

type Tone = keyof typeof TONE_MAP;

function DarkStat({ label, value, tone, sub }: { label: string; value: string; tone: Tone; sub?: string }) {
  const t = TONE_MAP[tone];
  return (
    <div className={`${t.bg} border rounded-2xl p-4`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${t.text}`}>{label}</p>
      <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
      {sub && <p className={`text-xs mt-1 opacity-80 ${t.text}`}>{sub}</p>}
    </div>
  );
}
