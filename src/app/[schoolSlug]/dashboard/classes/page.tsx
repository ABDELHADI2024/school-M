'use client';

import React, { useEffect, useMemo, useState, use, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  GraduationCap,
  Plus,
  Loader2,
  X,
  Users,
  BookOpen,
  User,
  Trash2,
  Pencil,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';

interface ClassRow {
  id: string;
  name: string;
  level: string;
  academic_year: string | null;
  max_students: number | null;
  main_teacher_id: string | null;
}

interface ClassSubject {
  id: string;
  subject_id: string;
  teacher_id: string | null;
  coefficient: number | null;
  subjects?: { id: string; name: string; code: string | null; default_color: string | null } | null;
}

interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
  default_color: string | null;
}

interface TeacherRow {
  id: string;
  first_name: string;
  last_name: string;
}

interface ClassWithExtras extends ClassRow {
  count: number;
  capacity: number | null;
  subjects: ClassSubject[];
}

const LEVEL_LABELS: Record<string, string> = {
  maternelle: 'Maternelle',
  primaire: 'Primaire',
  college: 'Collège',
  lycee: 'Lycée',
  bts: 'BTS',
};

const LEVEL_COLORS: Record<string, string> = {
  maternelle: 'bg-pink-100 text-pink-700 border-pink-200',
  primaire: 'bg-amber-100 text-amber-700 border-amber-200',
  college: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  lycee: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  bts: 'bg-violet-100 text-violet-700 border-violet-200',
};

const INITIAL_FORM = {
  name: '',
  level: 'college',
  academic_year: '2026-2027',
  max_students: '',
  main_teacher_id: '',
};

export default function ClassesPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [schoolId, setSchoolId] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [classes, setClasses] = useState<ClassWithExtras[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Modale création / édition
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formSaving, setFormSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Modale gestion matières
  const [subjectTarget, setSubjectTarget] = useState<ClassWithExtras | null>(null);
  const [subjectSaving, setSubjectSaving] = useState(false);

  // Modale suppression
  const [deleteTarget, setDeleteTarget] = useState<ClassWithExtras | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isReadOnly = role === 'teacher';

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: schoolData } = await supabase
        .from('schools')
        .select('*')
        .eq('slug', schoolSlug)
        .single();
      if (!schoolData) {
        if (!cancelled) setLoading(false);
        return;
      }

      let currentRole = '';
      if (user) {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        currentRole = profileData?.role ?? '';
      }

      const [{ data: classesData }, { data: subjectsData }, { data: studentsData }, { data: teachersData }] =
        await Promise.all([
          supabase
            .from('classes')
            .select('*, class_subjects(*, subjects(id, name, code, default_color))')
            .eq('school_id', schoolData.id)
            .order('name'),
          supabase.from('subjects').select('id, name, code, default_color').eq('school_id', schoolData.id).order('name'),
          supabase.from('students').select('class_id').eq('school_id', schoolData.id),
          supabase.from('teachers').select('id, first_name, last_name').eq('school_id', schoolData.id).order('last_name'),
        ]);

      if (!cancelled) {
        setSchool(schoolData);
        setSchoolId(schoolData.id);
        setRole(currentRole);
        const countByClass: Record<string, number> = {};
        (studentsData || []).forEach((s: { class_id: string | null }) => {
          if (s.class_id) countByClass[s.class_id] = (countByClass[s.class_id] || 0) + 1;
        });
        const mapped = ((classesData as unknown[]) || []).map((c) => {
          const row = c as ClassRow & { class_subjects?: ClassSubject[] };
          return {
            ...row,
            count: countByClass[row.id] || 0,
            capacity: row.max_students,
            subjects: row.class_subjects || [],
          } as ClassWithExtras;
        });
        setClasses(mapped);
        if (subjectsData) setSubjects(subjectsData as SubjectRow[]);
        if (teachersData) setTeachers(teachersData as TeacherRow[]);
        setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [schoolSlug, supabase, reloadKey]);

  const teacherName = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const t = teachers.find((t) => t.id === id);
      return t ? `${t.first_name} ${t.last_name}` : null;
    },
    [teachers]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ClassWithExtras[]>();
    classes.forEach((c) => {
      const levelKey = LEVEL_LABELS[c.level] || c.level || 'Autres';
      if (!map.has(levelKey)) map.set(levelKey, []);
      map.get(levelKey)!.push(c);
    });
    const order = Object.keys(LEVEL_LABELS);
    return [...map.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [classes]);

  const totalStudents = useMemo(() => classes.reduce((acc, c) => acc + c.count, 0), [classes]);
  const totalClasses = classes.length;

  function openCreate() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setIsFormOpen(true);
  }

  function openEdit(c: ClassWithExtras) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      level: c.level,
      academic_year: c.academic_year || '2026-2027',
      max_students: c.max_students ? String(c.max_students) : '',
      main_teacher_id: c.main_teacher_id || '',
    });
    setIsFormOpen(true);
  }

  async function handleSaveForm(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    setFormSaving(true);
    try {
      const payload = {
        school_id: schoolId,
        name: form.name.trim(),
        level: form.level,
        academic_year: form.academic_year,
        max_students: form.max_students ? Number(form.max_students) : null,
        main_teacher_id: form.main_teacher_id || null,
      };
      if (editingId) {
        const { error } = await supabase.from('classes').update(payload).eq('id', editingId);
        if (error) throw error;
        push('success', 'Classe mise à jour.');
      } else {
        const { error } = await supabase.from('classes').insert(payload);
        if (error) throw error;
        push('success', 'Classe créée.');
      }
      setIsFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setFormSaving(false);
    }
  }

  async function toggleSubject(subjectId: string, checked: boolean) {
    if (!subjectTarget) return;
    setSubjectSaving(true);
    try {
      if (checked) {
        const { error } = await supabase
          .from('class_subjects')
          .insert({ class_id: subjectTarget.id, subject_id: subjectId, coefficient: 1 });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('class_subjects')
          .delete()
          .eq('class_id', subjectTarget.id)
          .eq('subject_id', subjectId);
        if (error) throw error;
      }
      setReloadKey((k) => k + 1);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Modification impossible.');
    } finally {
      setSubjectSaving(false);
    }
  }

  async function updateCoefficient(subjectId: string, coefficient: number) {
    if (!subjectTarget) return;
    try {
      const { error } = await supabase
        .from('class_subjects')
        .update({ coefficient })
        .eq('class_id', subjectTarget.id)
        .eq('subject_id', subjectId);
      if (error) throw error;
      push('success', 'Coefficient mis à jour.');
      setReloadKey((k) => k + 1);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Modification impossible.');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('classes').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      push('success', `Classe ${deleteTarget.name} supprimée.`);
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-800">Classes & Matières</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Organisez vos classes, leurs capacités et les matières associées.</p>
        </div>
        {!isReadOnly && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            Créer une classe
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Classes', value: totalClasses, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Élèves répartis', value: totalStudents, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Matières', value: subjects.length, color: 'text-amber-600 bg-amber-50' },
          { label: 'Professeurs', value: teachers.length, color: 'text-violet-600 bg-violet-50' },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`${k.color} p-2.5 rounded-xl`}>
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 leading-none">{k.value}</p>
              <p className="text-xs text-slate-500 mt-1">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Cartes par niveau */}
      {loading ? (
        <div className="py-16 text-center flex items-center justify-center gap-2 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des classes…
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center space-y-2 shadow-sm">
          <GraduationCap className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="text-slate-600 font-medium text-sm">Aucune classe pour le moment.</p>
          <p className="text-xs text-slate-400">Créez votre première classe pour commencer l’organisation.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([level, items]) => (
            <div key={level}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{level}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((c) => {
                  const levelCls = LEVEL_COLORS[c.level] || 'bg-slate-100 text-slate-600 border-slate-200';
                  const pct = c.max_students ? Math.min(100, Math.round((c.count / c.max_students) * 100)) : 0;
                  const over = c.max_students !== null && c.count > c.max_students;
                  const teacher = teacherName(c.main_teacher_id);
                  return (
                    <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <GraduationCap className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800">{c.name}</h3>
                            <span className={`inline-flex items-center px-2 py-px rounded text-[10px] font-bold border ${levelCls}`}>
                              {LEVEL_LABELS[c.level] || c.level || '—'}
                            </span>
                          </div>
                        </div>
                        {!isReadOnly && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" aria-label="Modifier">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => setSubjectTarget(c)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition" aria-label="Matières">
                              <BookOpen className="h-4 w-4" />
                            </button>
                            <button onClick={() => setDeleteTarget(c)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" aria-label="Supprimer">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-slate-500 font-medium flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            Effectif
                          </span>
                          <span className={`font-bold ${over ? 'text-rose-600' : 'text-slate-700'}`}>
                            {c.count}{c.max_students ? ` / ${c.max_students}` : ''}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${over ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {c.max_students && (
                          <p className="text-[10px] text-slate-400 mt-1">{pct}% de la capacité</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {teacher || <span className="text-slate-300">Aucun prof principal</span>}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-600">
                          <BookOpen className="h-3.5 w-3.5" />
                          {c.subjects.length} matière{c.subjects.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modale création/édition */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800">{editingId ? 'Modifier la classe' : 'Créer une classe'}</h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveForm} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nom de la classe *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex : 6ème A"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Niveau</label>
                  <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none">
                    {Object.entries(LEVEL_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Capacité max (élèves)</label>
                  <input type="number" min={1} value={form.max_students} onChange={(e) => setForm({ ...form, max_students: e.target.value })}
                    placeholder="Ex : 40"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Année scolaire</label>
                  <input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Professeur principal</label>
                  <select value={form.main_teacher_id} onChange={(e) => setForm({ ...form, main_teacher_id: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none">
                    <option value="">Aucun</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition">Annuler</button>
                <button type="submit" disabled={formSaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-medium shadow-sm transition">
                  {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {formSaving ? 'Enregistrement…' : (editingId ? 'Enregistrer' : 'Créer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale gestion matières */}
      {subjectTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-slate-800">Matières — {subjectTarget.name}</h3>
              </div>
              <button onClick={() => setSubjectTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {subjectSaving && (
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mise à jour…
              </div>
            )}

            {subjects.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Aucune matière définie pour cette école. Ajoutez des matières depuis le module dédié.</p>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {subjects.map((sub) => {
                  const linked = subjectTarget.subjects.find((cs) => cs.subject_id === sub.id);
                  return (
                    <div key={sub.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="h-8 w-1.5 rounded-full shrink-0" style={{ backgroundColor: sub.default_color || '#4F46E5' }} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{sub.name}</p>
                          {sub.code && <p className="text-[10px] text-slate-400 uppercase">{sub.code}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {linked && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-400">Coeff</span>
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              defaultValue={linked.coefficient ?? 1}
                              onBlur={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v) && v > 0 && v !== linked.coefficient) void updateCoefficient(sub.id, v);
                              }}
                              className="w-16 px-2 py-1 text-sm bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        )}
                        <input
                          type="checkbox"
                          checked={!!linked}
                          disabled={subjectSaving}
                          onChange={(e) => void toggleSubject(sub.id, e.target.checked)}
                          className="h-4 w-4 accent-amber-600"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modale suppression */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="bg-rose-50 p-2.5 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Supprimer la classe</h3>
                <p className="text-sm text-slate-500">Cette action est irréversible.</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-700">
                Voulez-vous vraiment supprimer la classe <strong className="text-slate-900">{deleteTarget.name}</strong> ? Les élèves associés ne seront pas supprimés mais se retrouveront sans classe.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition">Annuler</button>
              <button onClick={handleDelete} disabled={deleting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white rounded-xl font-medium shadow-sm transition">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DashToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
