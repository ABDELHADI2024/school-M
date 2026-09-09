'use client';

import React, { useEffect, useState, use, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import { generateGradesTemplate, parseGradesExcel, GradeExcelRow } from '@/lib/excel/gradesExcel';
import {
  GraduationCap,
  Plus,
  Download,
  Upload,
  Save,
  FileSpreadsheet,
  FileText,
  X,
  Loader2,
  TrendingUp,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';

interface StudentRow {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
}

interface Evaluation {
  id: string;
  title: string;
  coefficient: number;
  max_score: number;
  type: string;
  term: string | null;
  evaluation_date: string | null;
}

const PERIODS = ['Toutes', 'Trimestre 1', 'Trimestre 2', 'Trimestre 3'];
const EVAL_TYPES = [
  { value: 'devoir', label: 'Devoir' },
  { value: 'interro', label: 'Interrogation' },
  { value: 'examen', label: 'Examen' },
];

export default function GradesPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState(PERIODS[0]);

  const [gradesMap, setGradesMap] = useState<Record<string, { score: string; comment: string }>>({});
  const [subjectAverages, setSubjectAverages] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [role, setRole] = useState('');

  const [isNewEvalOpen, setIsNewEvalOpen] = useState(false);
  const [evalForm, setEvalForm] = useState({
    title: '',
    type: 'devoir',
    coefficient: '1',
    max_score: '20',
    term: 'Trimestre 1',
    evaluation_date: new Date().toISOString().split('T')[0],
  });

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<GradeExcelRow[]>([]);

  const scoreRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isReadOnly = role === 'teacher';

  useEffect(() => {
    async function loadBase() {
      setLoading(true);
      const { data: s } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (s) {
        setSchool(s);
        const { data: { user } } = await supabase.auth.getUser();
        let currentRole = '';
        if (user) {
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle();
          currentRole = profileData?.role ?? '';
        }
        setRole(currentRole);

        const { data: cls } = await supabase.from('classes').select('id, name').eq('school_id', s.id);
        const { data: sub } = await supabase.from('subjects').select('id, name').eq('school_id', s.id);

        let activeSubs = sub || [];
        if (!sub || sub.length === 0) {
          const defaults = [
            { school_id: s.id, name: 'Mathématiques' },
            { school_id: s.id, name: 'Français' },
            { school_id: s.id, name: 'Histoire-Géographie' },
            { school_id: s.id, name: 'Sciences' },
            { school_id: s.id, name: 'Anglais' },
          ];
          const { data: createdSub } = await supabase.from('subjects').insert(defaults).select();
          activeSubs = createdSub || [];
        }

        setSubjects(activeSubs);
        if (activeSubs.length > 0) setSelectedSubjectId(activeSubs[0].id);
        if (cls && cls.length > 0) {
          setClasses(cls);
          setSelectedClassId(cls[0].id);
        }
      }
      setLoading(false);
    }
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolSlug]);

  useEffect(() => {
    async function loadClassData() {
      if (!school || !selectedClassId) return;
      const { data: st } = await supabase
        .from('students')
        .select('*')
        .eq('school_id', school.id)
        .eq('class_id', selectedClassId);
      setStudents(st || []);

      if (selectedSubjectId) {
        let query = supabase
          .from('evaluations')
          .select('*')
          .eq('school_id', school.id)
          .eq('class_id', selectedClassId)
          .eq('subject_id', selectedSubjectId);
        if (selectedPeriod !== 'Toutes') query = query.eq('term', selectedPeriod);
        const { data: ev } = await query.order('evaluation_date', { ascending: false });
        setEvaluations(ev || []);
        if (ev && ev.length > 0) {
          setSelectedEvaluationId(ev[0].id);
        } else {
          setSelectedEvaluationId('');
        }
      }
    }
    loadClassData();
  }, [school, selectedClassId, selectedSubjectId, selectedPeriod, supabase]);

  useEffect(() => {
    async function loadGrades() {
      if (!selectedEvaluationId || students.length === 0) {
        setGradesMap({});
        return;
      }
      const { data: gr } = await supabase
        .from('grades')
        .select('*')
        .eq('evaluation_id', selectedEvaluationId);
      const map: Record<string, { score: string; comment: string }> = {};
      students.forEach((st) => {
        const existing = gr?.find((g) => g.student_id === st.id);
        map[st.id] = {
          score: existing?.score !== null && existing?.score !== undefined ? String(existing.score) : '',
          comment: existing?.comment || '',
        };
      });
      setGradesMap(map);
    }
    loadGrades();
  }, [selectedEvaluationId, students, supabase]);

  // Moyennes par élève sur toutes les évaluations de la matière (en temps réel)
  useEffect(() => {
    async function loadSubjectAverages() {
      if (!school || !selectedClassId || !selectedSubjectId || students.length === 0) {
        setSubjectAverages({});
        return;
      }
      let query = supabase
        .from('evaluations')
        .select('id, coefficient')
        .eq('school_id', school.id)
        .eq('class_id', selectedClassId)
        .eq('subject_id', selectedSubjectId);
      if (selectedPeriod !== 'Toutes') query = query.eq('term', selectedPeriod);
      const { data: evs } = await query;
      if (!evs || evs.length === 0) {
        setSubjectAverages({});
        return;
      }
      const evalIds = evs.map((e) => e.id);
      const { data: gr } = await supabase
        .from('grades')
        .select('evaluation_id, student_id, score, coefficient')
        .in('evaluation_id', evalIds);

      const averages: Record<string, number | null> = {};
      students.forEach((st) => {
        let totalW = 0;
        let totalC = 0;
        evs.forEach((ev) => {
          const g = (gr || []).find((x) => x.evaluation_id === ev.id && x.student_id === st.id);
          const coeff = Number(ev.coefficient) || 1;
          if (g && g.score !== null) {
            totalW += Number(g.score) * coeff;
            totalC += coeff;
          }
        });
        // Ajouter la note en cours de saisie pour la moyenne temps réel
        averages[st.id] = totalC > 0 ? totalW / totalC : null;
      });
      setSubjectAverages(averages);
    }
    loadSubjectAverages();
  }, [school, selectedClassId, selectedSubjectId, students, selectedPeriod, supabase]);

  const saveGrades = useCallback(async () => {
    if (!school || !selectedEvaluationId) return;
    setSaving(true);
    setSaveSuccess(false);
    const rowsToUpsert = Object.entries(gradesMap)
      .filter(([, data]) => data.score !== '')
      .map(([studentId, data]) => ({
        school_id: school.id,
        evaluation_id: selectedEvaluationId,
        student_id: studentId,
        score: parseFloat(data.score.replace(',', '.')),
        comment: data.comment,
      }));
    const { error } = await supabase.from('grades').upsert(rowsToUpsert, { onConflict: 'evaluation_id,student_id' });
    setSaving(false);
    if (error) {
      push('error', `Erreur d'enregistrement : ${error.message}`);
    } else {
      setSaveSuccess(true);
      push('success', `${rowsToUpsert.length} note(s) enregistrée(s).`);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  }, [school, selectedEvaluationId, gradesMap, supabase, push]);

  const handleCreateEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !selectedClassId || !selectedSubjectId || !evalForm.title) return;
    const { data: newEval } = await supabase
      .from('evaluations')
      .insert([{
        school_id: school.id,
        class_id: selectedClassId,
        subject_id: selectedSubjectId,
        title: evalForm.title,
        type: evalForm.type,
        coefficient: parseFloat(evalForm.coefficient) || 1,
        max_score: parseFloat(evalForm.max_score) || 20,
        term: evalForm.term,
        evaluation_date: evalForm.evaluation_date || null,
      }])
      .select()
      .single();
    if (newEval) {
      setEvaluations([newEval as Evaluation, ...evaluations]);
      setSelectedEvaluationId(newEval.id);
      setIsNewEvalOpen(false);
      setEvalForm({ title: '', type: 'devoir', coefficient: '1', max_score: '20', term: 'Trimestre 1', evaluation_date: new Date().toISOString().split('T')[0] });
      push('success', 'Évaluation créée.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = await parseGradesExcel(file);
      setParsedRows(rows);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Erreur lors de la lecture du fichier Excel.');
    }
  };

  const handleApplyExcelGrades = () => {
    const newMap = { ...gradesMap };
    parsedRows.forEach((row) => {
      if (!row.isValid || row.score === null) return;
      const st = students.find((s) => s.matricule.toLowerCase() === row.matricule.toLowerCase());
      if (st) {
        newMap[st.id] = { score: String(row.score), comment: row.comment || newMap[st.id]?.comment || '' };
      }
    });
    setGradesMap(newMap);
    push('success', 'Notes importées dans la grille.');
    setIsImportOpen(false);
    setParsedRows([]);
  };

  const updateScore = (studentId: string, value: string, moveNext = false) => {
    setGradesMap((prev) => ({ ...prev, [studentId]: { ...prev[studentId], score: value } }));
    if (moveNext) {
      const idx = students.findIndex((s) => s.id === studentId);
      const next = students[idx + 1];
      if (next && scoreRefs.current[next.id]) {
        scoreRefs.current[next.id]?.focus();
      }
    }
  };

  const handleScoreKeyDown = (studentId: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = students.findIndex((s) => s.id === studentId);
      const next = students[idx + 1];
      if (next && scoreRefs.current[next.id]) {
        scoreRefs.current[next.id]?.focus();
        scoreRefs.current[next.id]?.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = students.findIndex((s) => s.id === studentId);
      const prev = students[idx - 1];
      if (prev && scoreRefs.current[prev.id]) {
        scoreRefs.current[prev.id]?.focus();
        scoreRefs.current[prev.id]?.select();
      }
    }
  };

  const currentClass = classes.find((c) => c.id === selectedClassId);
  const currentSubject = subjects.find((s) => s.id === selectedSubjectId);
  const currentEval = evaluations.find((e) => e.id === selectedEvaluationId);

  // Moyenne de classe en temps réel (évaluation courante)
  const classAverage = useMemo(() => {
    const scores: number[] = [];
    Object.values(gradesMap).forEach((g) => {
      if (g.score !== '') {
        const v = parseFloat(g.score.replace(',', '.'));
        if (!isNaN(v)) scores.push(v);
      }
    });
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }, [gradesMap]);

  const filledCount = useMemo(
    () => Object.values(gradesMap).filter((g) => g.score !== '').length,
    [gradesMap]
  );

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 py-20 text-slate-400 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du carnet de notes…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <DashToastStack toasts={toasts} onDismiss={dismiss} />

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
              <GraduationCap className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Carnet de Notes & Évaluations</h1>
              <p className="text-sm text-slate-400 mt-0.5">Saisie matricielle rapide au clavier + calcul temps réel des moyennes.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/${schoolSlug}/dashboard/grades/report-cards`}
            className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium transition"
          >
            <FileText className="h-4 w-4 text-indigo-400" />
            Bulletins
          </Link>
          {!isReadOnly && (
            <button
              onClick={() => setIsNewEvalOpen(true)}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition"
            >
              <Plus className="h-4 w-4" />
              Nouvelle évaluation
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 mb-3">
            <FileText className="h-5 w-5 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white leading-none">{evaluations.length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Évaluations</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 mb-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white leading-none">{filledCount}</p>
          <p className="text-xs text-slate-400 mt-1.5">Notes saisies</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-sky-500/30 bg-sky-500/10 mb-3">
            <TrendingUp className="h-5 w-5 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-white leading-none">{classAverage.toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1.5">Moyenne de classe</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 mb-3">
            <Users className="h-5 w-5 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white leading-none">{students.length}</p>
          <p className="text-xs text-slate-400 mt-1.5">Élèves</p>
        </div>
      </div>

      {/* Sélecteurs */}
      <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 shadow-lg">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Classe</label>
          <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full p-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-200 font-medium outline-none focus:ring-2 focus:ring-indigo-500">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Matière</label>
          <select value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="w-full p-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-200 font-medium outline-none focus:ring-2 focus:ring-indigo-500">
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Période</label>
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full p-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-200 font-medium outline-none focus:ring-2 focus:ring-indigo-500">
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Évaluation</label>
          <select value={selectedEvaluationId} onChange={(e) => setSelectedEvaluationId(e.target.value)}
            disabled={evaluations.length === 0}
            className="w-full p-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-200 font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
            {evaluations.length === 0 ? (
              <option>Aucune évaluation</option>
            ) : (
              evaluations.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} · Coeff {ev.coefficient} · /{ev.max_score}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Grille de saisie */}
      <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-indigo-400" />
            <div>
              <h2 className="font-bold text-white text-sm">{currentEval ? currentEval.title : 'Sélectionnez ou créez une évaluation'}</h2>
              {currentEval && (
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {EVAL_TYPES.find((t) => t.value === currentEval.type)?.label || 'Devoir'} · Coeff {currentEval.coefficient} · /{currentEval.max_score} · {currentEval.term || 'Période libre'} · {currentEval.evaluation_date || '—'}
                </p>
              )}
            </div>
          </div>

          {currentEval && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-300 hidden sm:inline-flex items-center gap-1">
                Moy. classe : <strong className="text-white">{classAverage.toFixed(2)}</strong>
              </span>
              <button
                onClick={() => school && currentClass && currentSubject && currentEval && generateGradesTemplate(
                  school.name, currentClass.name, currentSubject.name, currentEval.title, students
                )}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 border border-slate-600 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold transition"
              >
                <Download className="h-3.5 w-3.5" />
                Grille Excel
              </button>
              <button
                onClick={() => setIsImportOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold transition"
              >
                <Upload className="h-3.5 w-3.5" />
                Importer Notes
              </button>
              {!isReadOnly && (
                <button
                  onClick={saveGrades}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700/60 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saveSuccess ? 'Enregistré !' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              )}
            </div>
          )}
        </div>

        {students.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Aucun élève dans cette classe.</div>
        ) : !currentEval ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-slate-200 text-sm font-medium">Aucune évaluation sélectionnée.</p>
            <p className="text-xs text-slate-400">Cliquez sur « Nouvelle évaluation » pour créer le premier devoir de cette matière.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-4 w-32 font-semibold">Matricule</th>
                  <th className="p-4 font-semibold">Élève</th>
                  <th className="p-4 font-semibold">Moy. matière</th>
                  <th className="p-4 w-44 font-semibold">Note / {currentEval.max_score}</th>
                  <th className="p-4 font-semibold">Appréciation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {students.map((st) => {
                  const raw = gradesMap[st.id]?.score || '';
                  const isFilled = raw !== '';
                  const value = isFilled ? parseFloat(raw.replace(',', '.')) : null;
                  const avg = subjectAverages[st.id];
                  return (
                    <tr key={st.id} className="hover:bg-slate-700/40">
                      <td className="p-4 font-mono text-xs text-slate-400">{st.matricule}</td>
                      <td className="p-4 font-medium text-slate-100">{st.first_name} {st.last_name}</td>
                      <td className="p-4">
                        <span className={`text-xs font-bold ${avg === null ? 'text-slate-500' : 'text-emerald-400'}`}>
                          {avg === null ? '—' : avg.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-4">
                        <input
                          ref={(el) => { scoreRefs.current[st.id] = el; }}
                          type="number"
                          step="0.25"
                          min="0"
                          max={currentEval.max_score}
                          disabled={isReadOnly}
                          placeholder={`— / ${currentEval.max_score}`}
                          value={raw}
                          onChange={(e) => updateScore(st.id, e.target.value)}
                          onKeyDown={(e) => handleScoreKeyDown(st.id, e)}
                          className={`w-28 px-3 py-1.5 bg-slate-900/70 border rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                            value === null ? 'text-slate-200 border-slate-600' : value >= 10 ? 'text-emerald-400 border-emerald-500/60' : 'text-rose-400 border-rose-500/60'
                          }`}
                        />
                      </td>
                      <td className="p-4">
                        <input
                          type="text"
                          disabled={isReadOnly}
                          placeholder="Commentaire…"
                          value={gradesMap[st.id]?.comment || ''}
                          onChange={(e) => setGradesMap((prev) => ({ ...prev, [st.id]: { ...prev[st.id], comment: e.target.value } }))}
                          className="w-full px-3 py-1.5 bg-slate-900/70 border border-slate-600 rounded-lg text-xs text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-50"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {currentEval && (
          <div className="px-4 py-2.5 border-t border-slate-700/60 bg-slate-900/40 text-xs text-slate-400">
            Astuce : saisissez une note puis appuyez sur <span className="text-slate-200 font-semibold">Entrée</span> ou{' '}
            <span className="text-slate-200 font-semibold">↓</span> pour passer à l&apos;élève suivant.
          </div>
        )}
      </div>

      {/* Modale Nouvelle Évaluation */}
      {isNewEvalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white">Ajouter une évaluation</h3>
            <form onSubmit={handleCreateEvaluation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Titre de l&apos;évaluation *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Contrôle Continu N°1"
                  value={evalForm.title}
                  onChange={(e) => setEvalForm({ ...evalForm, title: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {EVAL_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setEvalForm({ ...evalForm, type: t.value })}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition ${
                        evalForm.type === t.value
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Coefficient</label>
                  <input type="number" step="0.5" min="0.5" value={evalForm.coefficient}
                    onChange={(e) => setEvalForm({ ...evalForm, coefficient: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Note max /20</label>
                  <input type="number" value={evalForm.max_score}
                    onChange={(e) => setEvalForm({ ...evalForm, max_score: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Période</label>
                  <select value={evalForm.term} onChange={(e) => setEvalForm({ ...evalForm, term: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none">
                    {PERIODS.filter((p) => p !== 'Toutes').map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Date</label>
                  <input type="date" value={evalForm.evaluation_date}
                    onChange={(e) => setEvalForm({ ...evalForm, evaluation_date: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsNewEvalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg font-medium">
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium">
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Import Notes */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2 font-bold text-white">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                <h3>Importer les notes depuis Excel</h3>
              </div>
              <button onClick={() => setIsImportOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            {parsedRows.length === 0 ? (
              <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center space-y-3 bg-slate-800/40">
                <Upload className="h-10 w-10 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-400">Sélectionnez la grille Excel complétée par l&apos;enseignant.</p>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow transition">
                  Parcourir mon ordinateur
                </button>
                <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" ref={fileInputRef} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-h-48 overflow-y-auto border border-slate-700 rounded-lg divide-y divide-slate-700/60 text-xs">
                  {parsedRows.map((r, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between">
                      <span className="font-mono text-slate-400">{r.matricule}</span>
                      <span className="font-medium text-slate-200">{r.student_name}</span>
                      <span className="font-bold text-indigo-400">{r.score !== null ? `${r.score} / 20` : '—'}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setParsedRows([])} className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg font-medium">
                    Changer de fichier
                  </button>
                  <button onClick={handleApplyExcelGrades} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-sm">
                    Appliquer dans la grille
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
