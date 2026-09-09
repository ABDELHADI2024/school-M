'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  UtensilsCrossed,
  Plus,
  Save,
  X,
  Loader2,
  Users,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';
import { todayIso, formatMoney } from '@/lib/format';

interface Plan {
  id: string;
  name: string;
  price: number;
  description: string | null;
  is_active: boolean;
}

interface Sub {
  id: string;
  student_id: string;
  plan_id: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  plan_name?: string;
  student_name?: string;
  matricule?: string;
  medical_notes?: string | null;
  class_name?: string;
}

export default function CanteenPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; first_name: string; last_name: string; matricule: string; class_id: string | null; medical_notes: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<'subs' | 'attendance' | 'plans'>('subs');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});

  const [planModal, setPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({ name: '', price: '1500', description: '', is_active: true });
  const [savingPlan, setSavingPlan] = useState(false);

  const [subModal, setSubModal] = useState(false);
  const [subForm, setSubForm] = useState({ student_id: '', plan_id: '', start_date: todayIso(), end_date: '', status: 'active' });
  const [savingSub, setSavingSub] = useState(false);

  const [isStaff, setIsStaff] = useState(false);

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
        const { data: st } = await supabase.from('students').select('*').eq('school_id', s.id);
        setStudents(st || []);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolSlug]);

  useEffect(() => {
    if (!schoolId) return;
    async function loadData() {
      const { data: pl } = await supabase.from('canteen_plans').select('*').eq('school_id', schoolId);
      setPlans(pl || []);
      const { data: su } = await supabase
        .from('student_canteen_subscriptions')
        .select('id, student_id, plan_id, start_date, end_date, status, students!inner(first_name, last_name, matricule, medical_notes), canteen_plans(name)')
        .eq('school_id', schoolId);
      const mapped: Sub[] = ((su as any[]) || []).map((x) => ({
        id: x.id,
        student_id: x.student_id,
        plan_id: x.plan_id,
        start_date: x.start_date,
        end_date: x.end_date,
        status: x.status,
        plan_name: x.canteen_plans?.name,
        student_name: `${x.students?.first_name} ${x.students?.last_name}`,
        matricule: x.students?.matricule,
        medical_notes: x.students?.medical_notes,
      }));
      setSubs(mapped);

      const { data: att } = await supabase
        .from('canteen_attendance')
        .select('student_id, status')
        .eq('school_id', schoolId)
        .eq('meal_date', selectedDate);
      const map: Record<string, string> = {};
      mapped.forEach((m) => (map[m.student_id] = 'serve'));
      (att || []).forEach((a) => (map[a.student_id] = a.status));
      setAttendanceMap(map);
    }
    loadData();
  }, [schoolId, selectedDate, supabase]);

  const activeSubIds = new Set(subs.filter((s) => s.status === 'active').map((s) => s.student_id));
  const attendedToday = Object.values(attendanceMap).filter((v) => v === 'served').length;

  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlan(true);
    const { error } = await supabase.from('canteen_plans').insert([{
      school_id: schoolId,
      name: planForm.name,
      price: parseFloat(planForm.price) || 0,
      description: planForm.description || null,
      is_active: planForm.is_active,
    }]);
    setSavingPlan(false);
    if (error) push('error', error.message);
    else {
      push('success', 'Formule cantine créée.');
      setPlanModal(false);
      setPlanForm({ name: '', price: '1500', description: '', is_active: true });
      const { data } = await supabase.from('canteen_plans').select('*').eq('school_id', schoolId);
      setPlans(data || []);
    }
  };

  const saveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSub(true);
    const { error } = await supabase.from('student_canteen_subscriptions').insert([{
      school_id: schoolId,
      student_id: subForm.student_id,
      plan_id: subForm.plan_id || null,
      start_date: subForm.start_date,
      end_date: subForm.end_date || null,
      status: subForm.status,
    }]);
    setSavingSub(false);
    if (error) push('error', error.message);
    else {
      push('success', 'Abonnement enregistré.');
      setSubModal(false);
      setSubForm({ student_id: '', plan_id: '', start_date: todayIso(), end_date: '', status: 'active' });
      const { data } = await supabase
        .from('student_canteen_subscriptions')
        .select('id, student_id, plan_id, start_date, end_date, status, students!inner(first_name, last_name, matricule, medical_notes), canteen_plans(name)')
        .eq('school_id', schoolId);
      setSubs(((data as any[]) || []).map((x) => ({
        id: x.id, student_id: x.student_id, plan_id: x.plan_id, start_date: x.start_date, end_date: x.end_date, status: x.status,
        plan_name: x.canteen_plans?.name, student_name: `${x.students?.first_name} ${x.students?.last_name}`,
        matricule: x.students?.matricule, medical_notes: x.students?.medical_notes,
      })));
    }
  };

  const updateAttendance = async (studentId: string, status: string) => {
    setAttendanceMap((prev) => ({ ...prev, [studentId]: status }));
    const { error } = await supabase.from('canteen_attendance').upsert(
      [{ school_id: schoolId, student_id: studentId, meal_date: selectedDate, meal_type: 'lunch', status, recorded_by: (await supabase.auth.getUser()).data.user?.id }],
      { onConflict: 'student_id,meal_date,meal_type' }
    );
    if (error) push('error', error.message);
  };

  const removeSub = async (id: string) => {
    const { error } = await supabase.from('student_canteen_subscriptions').delete().eq('id', id);
    if (error) push('error', error.message);
    else {
      setSubs((prev) => prev.filter((s) => s.id !== id));
      push('success', 'Abonnement supprimé.');
    }
  };

  const STOP_TYPES = [
    { value: 'served', label: 'Servi', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    { value: 'absent', label: 'Absent', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
    { value: 'excused', label: 'Excusé', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  ];

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
              <UtensilsCrossed className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Cantine Scolaire</h1>
              <p className="text-sm text-slate-400 mt-0.5">Abonnements, présences au réfectoire et alertes régimes.</p>
            </div>
          </div>
        </div>
        {isStaff && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setPlanModal(true)} className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium transition">
              <Plus className="h-4 w-4 text-emerald-400" /> Formule
            </button>
            <button onClick={() => setSubModal(true)} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition">
              <UserPlus className="h-4 w-4" /> Abonner un élève
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 mb-3"><Users className="h-5 w-5 text-indigo-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{subs.filter((s) => s.status === 'active').length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Abonnements actifs</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 mb-3"><CalendarDays className="h-5 w-5 text-emerald-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{attendedToday}</p>
          <p className="text-xs text-slate-400 mt-1.5">Servis aujourd&apos;hui</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 mb-3"><CheckCircle2 className="h-5 w-5 text-emerald-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{plans.length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Formules</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 mb-3"><AlertTriangle className="h-5 w-5 text-amber-400" /></div>
          <p className="text-2xl font-bold text-white leading-none">{subs.filter((s) => s.medical_notes && s.status === 'active').length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Alertes régime/allergie</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {([['subs', 'Abonnements'], ['attendance', 'Présences'], ['plans', 'Formules & Menus']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === key ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'subs' && (
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-slate-700/60 flex items-center justify-between bg-slate-900/60">
            <h2 className="font-bold text-white text-sm">Abonnements cantine</h2>
            <span className="text-xs text-slate-400">{subs.length} élève(s)</span>
          </div>
          {subs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">Aucun abonnement. Cliquez sur « Abonner un élève ».</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-semibold">Élève</th>
                    <th className="p-4 font-semibold">Matricule</th>
                    <th className="p-4 font-semibold">Formule</th>
                    <th className="p-4 font-semibold">Début</th>
                    <th className="p-4 font-semibold">Statut</th>
                    <th className="p-4 font-semibold">Régime / Allergie</th>
                    {isStaff && <th className="p-4 text-right font-semibold">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {subs.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-700/40">
                      <td className="p-4 font-medium text-slate-100">{s.student_name}</td>
                      <td className="p-4 font-mono text-xs text-slate-400">{s.matricule}</td>
                      <td className="p-4 text-slate-200">{s.plan_name || '—'}</td>
                      <td className="p-4 text-slate-400">{s.start_date}</td>
                      <td className="p-4">
                        <span className={`text-xs font-semibold inline-flex px-2.5 py-1 rounded-lg ${
                          s.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                          s.status === 'paused' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>{s.status}</span>
                      </td>
                      <td className="p-4 text-xs text-amber-300">{s.medical_notes || '—'}</td>
                      {isStaff && (
                        <td className="p-4 text-right">
                          <button onClick={() => removeSub(s.id)} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60">
            <h2 className="font-bold text-white text-sm">Présences au réfectoire</h2>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-900/70 border border-slate-600 rounded-lg text-xs text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-4 font-semibold">Élève</th>
                  <th className="p-4 font-semibold">Matricule</th>
                  <th className="p-4 font-semibold">Formule</th>
                  <th className="p-4 font-semibold">Régime</th>
                  <th className="p-4 font-semibold">Statut du repas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {subs.filter((s) => s.status === 'active').map((s) => (
                  <tr key={s.id} className="hover:bg-slate-700/40">
                    <td className="p-4 font-medium text-slate-100">{s.student_name}</td>
                    <td className="p-4 font-mono text-xs text-slate-400">{s.matricule}</td>
                    <td className="p-4 text-slate-200">{s.plan_name || '—'}</td>
                    <td className="p-4 text-xs text-amber-300">{s.medical_notes || '—'}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {STOP_TYPES.map((st) => (
                          <button key={st.value} onClick={() => updateAttendance(s.student_id, st.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${attendanceMap[s.student_id] === st.value ? st.cls : 'bg-slate-900/50 text-slate-400 border-slate-700 hover:bg-slate-700'}`}>
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {subs.filter((s) => s.status === 'active').length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">Aucun élève abonné.</div>
          )}
        </div>
      )}

      {tab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.length === 0 ? (
            <div className="md:col-span-3 bg-slate-800/60 border border-slate-700/80 rounded-2xl p-12 text-center text-slate-400 text-sm">Aucune formule. Créez votre première formule cantine.</div>
          ) : plans.map((p) => (
            <div key={p.id} className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {p.is_active ? 'Active' : 'Inactive'}
                </span>
                <UtensilsCrossed className="h-5 w-5 text-emerald-400" />
              </div>
              <h3 className="font-bold text-white text-lg">{p.name}</h3>
              <p className="text-slate-400 text-sm mt-1 min-h-8">{p.description || '—'}</p>
              <p className="text-2xl font-bold text-emerald-400 mt-3">{formatMoney(p.price)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal abonnement */}
      {subModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="font-bold text-white">Abonner un élève</h3>
              <button onClick={() => setSubModal(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveSub} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Élève *</label>
                <select required value={subForm.student_id} onChange={(e) => setSubForm({ ...subForm, student_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Choisir…</option>
                  {students.map((st) => <option key={st.id} value={st.id}>{st.first_name} {st.last_name} · {st.matricule}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Formule</label>
                <select value={subForm.plan_id} onChange={(e) => setSubForm({ ...subForm, plan_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Sans formule</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Début</label>
                  <input type="date" value={subForm.start_date} onChange={(e) => setSubForm({ ...subForm, start_date: e.target.value })} className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Fin (option)</label>
                  <input type="date" value={subForm.end_date} onChange={(e) => setSubForm({ ...subForm, end_date: e.target.value })} className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Statut</label>
                <select value={subForm.status} onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none">
                  <option value="active">Active</option>
                  <option value="paused">Suspendue</option>
                  <option value="cancelled">Annulée</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
                <button type="button" onClick={() => setSubModal(false)} className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-xl font-medium transition">Annuler</button>
                <button type="submit" disabled={savingSub} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium shadow-sm transition">
                  {savingSub ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal formule */}
      {planModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="font-bold text-white">Nouvelle formule cantine</h3>
              <button onClick={() => setPlanModal(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={savePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Nom *</label>
                <input required value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Ex : Repas complet"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Prix</label>
                <input type="number" step="50" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Description</label>
                <textarea value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none min-h-20" />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
                <button type="button" onClick={() => setPlanModal(false)} className="px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-xl font-medium transition">Annuler</button>
                <button type="submit" disabled={savingPlan} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium shadow-sm transition">
                  {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
