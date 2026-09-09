'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  Users, GraduationCap, CalendarCheck, CreditCard, Clock, TrendingUp,
  TrendingDown, AlertCircle, CheckCircle2, UserCheck, UserX, Percent,
  BookOpen, DollarSign, FileSpreadsheet, ArrowRight, Megaphone,
  CalendarDays, ClipboardList, Upload, Banknote,
} from 'lucide-react';

const DAY_NAMES_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

interface DashboardData {
  totalStudents: number;
  maleStudents: number;
  femaleStudents: number;
  todayPresent: number;
  todayAbsent: number;
  todayLate: number;
  todayExcused: number;
  totalDue: number;
  totalPaid: number;
  evalCount: number;
  avgGrade: number;
  todaySlots: { subject: string; teacher: string; room: string; start: string; end: string; color: string }[];
  recentGrades: { student: string; subject: string; score: number; date: string }[];
  recentAbsences: { student: string; date: string; status: string }[];
  overdueInvoices: { student: string; remaining: number; dueDate: string; parentPhone: string }[];
  unjustifiedAbsences: { student: string; date: string }[];
}

export default function DashboardHomePage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();

  const [school, setSchool] = useState<School | null>(null);
  const [data, setData] = useState<DashboardData>({
    totalStudents: 0, maleStudents: 0, femaleStudents: 0,
    todayPresent: 0, todayAbsent: 0, todayLate: 0, todayExcused: 0,
    totalDue: 0, totalPaid: 0,
    evalCount: 0, avgGrade: 0,
    todaySlots: [], recentGrades: [], recentAbsences: [],
    overdueInvoices: [], unjustifiedAbsences: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: s } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (!s) { setLoading(false); return; }
      setSchool(s);
      const sid = s.id;
      const today = new Date().toISOString().split('T')[0];
      const dayOfWeek = new Date().getDay() || 7; // 1=Mon..7=Sun
      const monthStart = today.slice(0, 7) + '-01';

      const [
        { count: totalStudents },
        { count: maleStudents },
        { count: femaleStudents },
        attToday,
        { count: evalCount },
        gradesAgg,
        recentGradesRes,
        recentAbsRes,
        invoicesRes,
        slotsRes,
      ] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', sid),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', sid).eq('gender', 'M'),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', sid).eq('gender', 'F'),
        supabase.from('attendance').select('student_id, date, status, students!inner(first_name, last_name)').eq('school_id', sid).eq('date', today),
        supabase.from('evaluations').select('*', { count: 'exact', head: true }).eq('school_id', sid),
        supabase.from('grades').select('score').eq('school_id', sid),
        supabase.from('grades').select('student_id, score, created_at, students(first_name, last_name), evaluations(title, subjects(name))').eq('school_id', sid).order('created_at', { ascending: false }).limit(5),
        supabase.from('attendance').select('student_id, date, status, students(first_name, last_name)').eq('school_id', sid).eq('status', 'absent').order('date', { ascending: false }).limit(5),
        supabase.from('invoices').select('id, amount_due, amount_paid, due_date, status, students(first_name, last_name, parent_phone)').eq('school_id', sid).in('status', ['overdue', 'partial', 'pending']),
        supabase.from('timetable_slots').select('subjects(name), teachers(first_name, last_name), rooms(name), start_time, end_time, color').eq('school_id', sid).eq('day_of_week', dayOfWeek).order('start_time'),
      ]);

      // Attendance
      const attRows = (attToday.data || []) as Record<string, unknown>[];
      const presentCount = attRows.filter((r) => r.status === 'present' || r.status === 'late').length;
      const absentCount = attRows.filter((r) => r.status === 'absent').length;
      const lateCount = attRows.filter((r) => r.status === 'late').length;
      const excusedCount = attRows.filter((r) => r.status === 'excused').length;

      // Finance
      const invRows = (invoicesRes.data || []) as Record<string, unknown>[];
      const totalDue = invRows.reduce((s, i) => s + Number(i.amount_due), 0);
      const totalPaid = invRows.reduce((s, i) => s + Number(i.amount_paid), 0);

      // Grades average
      const gradeScores = (gradesAgg.data || []).map((g) => Number(g.score)).filter((s) => !isNaN(s));
      const avgGrade = gradeScores.length > 0 ? gradeScores.reduce((a, b) => a + b, 0) / gradeScores.length : 0;

      // Today slots
      const slotsData = slotsRes.data || [];
      const todaySlots = slotsData.map((sl: Record<string, unknown>) => {
        const t = sl.teachers as Record<string, unknown> | null;
        const r = sl.rooms as Record<string, unknown> | null;
        const sub = sl.subjects as Record<string, unknown> | null;
        return {
          subject: (sub?.name as string) || '—',
          teacher: t ? `${t.last_name} ${String(t.first_name).charAt(0)}.` : '—',
          room: (r?.name as string) || '—',
          start: sl.start_time as string,
          end: sl.end_time as string,
          color: (sl.color as string) || '#4F46E5',
        };
      });

      // Recent grades
      const recentGrades = ((recentGradesRes.data || []) as Record<string, unknown>[]).map((g) => ({
        student: g.students ? `${(g.students as Record<string, unknown>).last_name} ${String((g.students as Record<string, unknown>).first_name).charAt(0)}.` : '—',
        subject: g.evaluations ? String(((g.evaluations as Record<string, unknown>).subjects as Record<string, unknown>)?.name || '') : '—',
        score: Number(g.score),
        date: g.created_at ? new Date(g.created_at as string).toLocaleDateString('fr-FR') : '',
      }));

      // Recent absences
      const recentAbsences = ((recentAbsRes.data || []) as Record<string, unknown>[]).map((a) => ({
        student: a.students ? `${(a.students as Record<string, unknown>).last_name} ${String((a.students as Record<string, unknown>).first_name).charAt(0)}.` : '—',
        date: a.date as string,
        status: a.status as string,
      }));

      // Overdue invoices
      const overdueInvoices = ((invoicesRes.data || []) as Record<string, unknown>[])
        .filter((i) => i.status === 'overdue')
        .slice(0, 5)
        .map((i) => {
          const st = Array.isArray(i.students) ? i.students[0] as Record<string, unknown> : i.students as Record<string, unknown> | null;
          return {
            student: st ? `${st.last_name} ${String(st.first_name).charAt(0)}.` : '—',
            remaining: Number(i.amount_due) - Number(i.amount_paid),
            dueDate: (i.due_date as string) || '',
            parentPhone: (st?.parent_phone as string) || '',
          };
        });

      // Unjustified absences (absent without excused)
      const unjustifiedAbsences = attRows
        .filter((a) => a.status === 'absent')
        .slice(0, 5)
        .map((a) => {
          const st = a.students as Record<string, unknown> | null;
          return {
            student: st ? `${st.last_name} ${String(st.first_name).charAt(0)}.` : '—',
            date: a.date as string,
          };
        });

      setData({
        totalStudents: totalStudents ?? 0,
        maleStudents: maleStudents ?? 0,
        femaleStudents: femaleStudents ?? 0,
        todayPresent: presentCount,
        todayAbsent: absentCount,
        todayLate: lateCount,
        todayExcused: excusedCount,
        totalDue, totalPaid,
        evalCount: evalCount ?? 0,
        avgGrade,
        todaySlots, recentGrades, recentAbsences,
        overdueInvoices, unjustifiedAbsences,
      });
      setLoading(false);
    }
    load();
  }, [schoolSlug, supabase]);

  const attendanceTotal = data.todayPresent + data.todayAbsent + data.todayLate + data.todayExcused;
  const attendanceRate = attendanceTotal > 0 ? Math.round((data.todayPresent / attendanceTotal) * 100) : 0;
  const financeRate = data.totalDue > 0 ? Math.round((data.totalPaid / data.totalDue) * 100) : 0;
  const primaryColor = school?.primary_color || '#4F46E5';

  if (loading) {
    return <div className="text-center py-20 text-slate-500 text-sm">Chargement du tableau de bord...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bonjour !</h1>
          <p className="text-sm text-slate-500">
            {DAY_NAMES_FR[new Date().getDay()]} {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '} {school?.name}
          </p>
        </div>
      </div>

      {/* 4 KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Effectif */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Effectif</p>
            <div className="p-2 rounded-lg" style={{ backgroundColor: primaryColor + '15' }}>
              <Users className="h-5 w-5" style={{ color: primaryColor }} />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-800">{data.totalStudents}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> {data.maleStudents} garçons</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-400" /> {data.femaleStudents} filles</span>
          </div>
        </div>

        {/* Présence aujourd'hui */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Présence aujourd&apos;hui</p>
            <div className="bg-emerald-50 p-2 rounded-lg">
              <Percent className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {attendanceTotal > 0 ? `${attendanceRate}%` : '—'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${attendanceRate}%` }} />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">{data.todayPresent}/{attendanceTotal}</span>
          </div>
        </div>

        {/* Recouvrement */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Recouvrement</p>
            <div className="bg-indigo-50 p-2 rounded-lg">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-800">{financeRate}%</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {data.totalPaid.toLocaleString('fr-FR')} F / {data.totalDue.toLocaleString('fr-FR')} F
          </p>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Moyenne générale</p>
            <div className="bg-amber-50 p-2 rounded-lg">
              <BookOpen className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {data.avgGrade > 0 ? data.avgGrade.toFixed(1) : '—'} <span className="text-lg text-slate-400">/ 20</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{data.evalCount} évaluation{data.evalCount > 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Raccourcis rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Prendre l\'appel', href: `/${schoolSlug}/dashboard/attendance`, icon: ClipboardList, color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' },
          { label: 'Saisir des notes', href: `/${schoolSlug}/dashboard/grades`, icon: GraduationCap, color: 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100' },
          { label: 'Encaisser un paiement', href: `/${schoolSlug}/dashboard/finance`, icon: Banknote, color: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' },
          { label: 'Gérer les élèves', href: `/${schoolSlug}/dashboard/students`, icon: Users, color: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm font-semibold transition ${action.color}`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">{action.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Grille principale : Planning + Alertes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Planning du jour */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" style={{ color: primaryColor }} />
              <h2 className="font-bold text-slate-800 text-sm">Planning du jour</h2>
            </div>
            <Link href={`/${schoolSlug}/dashboard/timetable`} className="text-xs font-semibold hover:underline" style={{ color: primaryColor }}>
              Voir tout →
            </Link>
          </div>
          <div className="p-5">
            {data.todaySlots.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Aucun cours prévu aujourd&apos;hui.</p>
            ) : (
              <div className="space-y-2.5">
                {data.todaySlots.map((sl, i) => (
                  <div key={i} className="flex items-center gap-3 group">
                    <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: sl.color }} />
                    <div className="flex-1 flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5 group-hover:bg-slate-100 transition">
                      <div>
                        <span className="font-semibold text-sm text-slate-800">{sl.subject}</span>
                        <span className="text-xs text-slate-500 ml-2">· {sl.teacher}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{sl.start} – {sl.end}</span>
                        <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-semibold">{sl.room}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Alertes & Actions requises */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-500" />
              <h2 className="font-bold text-slate-800 text-sm">Alertes</h2>
            </div>
          </div>
          <div className="p-5 space-y-5">
            {/* Factures en retard */}
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5 text-rose-500" />
                Factures en retard ({data.overdueInvoices.length})
              </p>
              {data.overdueInvoices.length === 0 ? (
                <p className="text-xs text-slate-400 pl-5">Aucune facture en retard</p>
              ) : (
                <div className="space-y-1.5">
                  {data.overdueInvoices.map((inv, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-rose-50/60">
                      <span className="text-slate-700 font-medium">{inv.student}</span>
                      <span className="font-mono text-rose-600 font-semibold">{inv.remaining.toLocaleString('fr-FR')} F</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Absences à justifier */}
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                <UserX className="h-3.5 w-3.5 text-amber-500" />
                Absences non justifiées ({data.unjustifiedAbsences.length})
              </p>
              {data.unjustifiedAbsences.length === 0 ? (
                <p className="text-xs text-slate-400 pl-5">Toutes les absences sont justifiées</p>
              ) : (
                <div className="space-y-1.5">
                  {data.unjustifiedAbsences.map((abs, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-amber-50/60">
                      <span className="text-slate-700 font-medium">{abs.student}</span>
                      <span className="text-slate-500">{abs.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dernières activités */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dernières notes */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-indigo-500" />
              <h2 className="font-bold text-slate-800 text-sm">Dernières notes saisies</h2>
            </div>
            <Link href={`/${schoolSlug}/dashboard/grades`} className="text-xs font-semibold text-indigo-600 hover:underline">
              Tout voir →
            </Link>
          </div>
          <div className="p-5">
            {data.recentGrades.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Aucune note saisie récemment.</p>
            ) : (
              <div className="space-y-2">
                {data.recentGrades.map((g, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-slate-800">{g.student}</span>
                      <span className="text-xs text-slate-500 ml-2">· {g.subject}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${g.score >= 10 ? 'text-emerald-600' : g.score >= 8 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {g.score}/20
                      </span>
                      <span className="text-[10px] text-slate-400">{g.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dernières absences */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-rose-500" />
              <h2 className="font-bold text-slate-800 text-sm">Dernières absences</h2>
            </div>
            <Link href={`/${schoolSlug}/dashboard/attendance`} className="text-xs font-semibold text-indigo-600 hover:underline">
              Tout voir →
            </Link>
          </div>
          <div className="p-5">
            {data.recentAbsences.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Aucune absence récente.</p>
            ) : (
              <div className="space-y-2">
                {data.recentAbsences.map((a, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <span className="text-sm font-medium text-slate-800">{a.student}</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-600">
                        Absent
                      </span>
                      <span className="text-[10px] text-slate-400">{a.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
