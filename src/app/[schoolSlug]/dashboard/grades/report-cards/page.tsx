'use client';

import React, { useEffect, useState, use, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  generateReportCardPdf,
  downloadReportCard,
  generateAllReportCardsPdf,
  getDecision,
  ReportCardData,
  ReportCardSubject,
} from '@/lib/pdf/reportCardPdf';
import {
  FileText,
  Download,
  Users,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Lock,
  FileDown,
  TrendingUp,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';

const PERIODS = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];

interface ClassInfo {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface TeacherMap {
  [subjectId: string]: string;
}

interface StudentSummary {
  student: StudentRow;
  subjects: ReportCardSubject[];
  generalAverage: number;
  totalWeightedPoints: number;
  totalCoefficients: number;
  rank: number;
}

export default function ReportCardsPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teacherMap, setTeacherMap] = useState<TeacherMap>({});

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState(PERIODS[0]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);

  const locked = selectedPeriod === 'Trimestre 3';

  useEffect(() => {
    async function loadBase() {
      setLoading(true);
      const { data: s } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (s) {
        setSchool(s);
        const { data: cls } = await supabase.from('classes').select('id, name').eq('school_id', s.id);
        const { data: sub } = await supabase.from('subjects').select('id, name').eq('school_id', s.id);
        setClasses(cls || []);
        setSubjects(sub || []);
        if (cls && cls.length > 0) setSelectedClassId(cls[0].id);
      }
      setLoading(false);
    }
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolSlug]);

  // Charger enseignants (première évaluation de chaque matière à défaut) et élèves
  useEffect(() => {
    async function loadClass() {
      if (!school || !selectedClassId) return;
      const { data: st } = await supabase
        .from('students')
        .select('*')
        .eq('school_id', school.id)
        .eq('class_id', selectedClassId);
      setStudents(st || []);

      // Enseignants par matière via evaluations (le cas échéant) — fallback vide
      setTeacherMap({});
    }
    loadClass();
  }, [school, selectedClassId, supabase]);

  const computeSummaries = async () => {
    if (!school || !selectedClassId || students.length === 0 || subjects.length === 0) {
      push('error', 'Sélectionnez une classe contenant des élèves.');
      return;
    }
    setComputing(true);
    const activePeriod = selectedPeriod === PERIODS[2] ? 'Trimestre 3' : selectedPeriod;

    // Choisir le term à utiliser pour le bulletin :
    // Trimestre sélectionné, mais inclut toutes les évaluations <= cette période si c'est un trimestre.
    // On filtre strictement sur le term pour rester simple et fiable.
    const termFilter = selectedPeriod;

    const { data: evList } = await supabase
      .from('evaluations')
      .select('id, title, coefficient, max_score, type, term, subject_id')
      .eq('school_id', school.id)
      .eq('class_id', selectedClassId)
      .eq('term', termFilter);

    if (!evList || evList.length === 0) {
      push('error', `Aucune évaluation enregistrée pour la période « ${selectedPeriod} ».`);
      setComputing(false);
      setSummaries([]);
      return;
    }

    const evalIds = evList.map((e) => e.id);
    const { data: allGrades } = await supabase
      .from('grades')
      .select('evaluation_id, student_id, score')
      .in('evaluation_id', evalIds);

    const evBySubject: Record<string, typeof evList> = {};
    evList.forEach((ev) => {
      (evBySubject[ev.subject_id] = evBySubject[ev.subject_id] || []).push(ev);
    });

    // Moyennes par évaluation pour le min/max/moyenne de classe
    const evalStats: Record<string, { min: number; max: number; sum: number; count: number }> = {};
    (allGrades || []).forEach((g) => {
      if (g.score === null || g.score === undefined) return;
      const sEv = evalStats[g.evaluation_id] || { min: Infinity, max: -Infinity, sum: 0, count: 0 };
      const v = Number(g.score);
      sEv.min = Math.min(sEv.min, v);
      sEv.max = Math.max(sEv.max, v);
      sEv.sum += v;
      sEv.count += 1;
      evalStats[g.evaluation_id] = sEv;
    });
    const evalAvg: Record<string, number> = {};
    Object.entries(evalStats).forEach(([id, s]) => {
      evalAvg[id] = s.count > 0 ? s.sum / s.count : 0;
    });

    const summaries: StudentSummary[] = students.map((student) => {
      const subjectRows: ReportCardSubject[] = subjects.map((subj) => {
        const evs = evBySubject[subj.id] || [];
        let totalW = 0;
        let coeffTotal = 0;
        let termTotal = 0;
        evs.forEach((ev) => {
          const g = (allGrades || []).find((x) => x.evaluation_id === ev.id && x.student_id === student.id);
          if (g && g.score !== null) {
            const coeff = Number(ev.coefficient) || 1;
            totalW += Number(g.score) * coeff;
            coeffTotal += coeff;
            termTotal += coeff;
          }
        });
        const studentAvg = coeffTotal > 0 ? totalW / coeffTotal : null;

        let classMin: number | null = null;
        let classMax: number | null = null;
        let classAvgSum = 0;
        let classAvgCount = 0;
        evs.forEach((ev) => {
          const st = evalAvg[ev.id];
          if (st !== undefined) {
            classAvgSum += st;
            classAvgCount++;
          }
        });
        const classAvg = classAvgCount > 0 ? classAvgSum / classAvgCount : null;

        // min/max moyens sur l'ensemble des évaluations de la matière
        if (evs.length > 0) {
          const mins: number[] = [];
          const maxs: number[] = [];
          evs.forEach((ev) => {
            if (evalAvg[ev.id] !== undefined) {
              mins.push(evalStats[ev.id].min);
              maxs.push(evalStats[ev.id].max);
            }
          });
          if (mins.length > 0) {
            classMin = mins.reduce((a, b) => a + b, 0) / mins.length;
            classMax = maxs.reduce((a, b) => a + b, 0) / maxs.length;
          }
        }

        return {
          subject: subj.name,
          teacher: teacherMap[subj.id] || '',
          studentAvg,
          classMin,
          classMax,
          classAvg,
          coefficient: coeffTotal > 0 ? coeffTotal : 1,
          comment: studentAvg === null ? '' : '',
        };
      });

      const graded = subjectRows.filter((s) => s.studentAvg !== null);
      const totalWeightedPoints = graded.reduce((sum, s) => sum + (s.studentAvg! * s.coefficient), 0);
      const totalCoefficients = subjectRows.reduce((sum, s) => sum + s.coefficient, 0);
      const generalAverage = totalCoefficients > 0 ? totalWeightedPoints / totalCoefficients : 0;

      return {
        student,
        subjects: subjectRows,
        generalAverage,
        totalWeightedPoints,
        totalCoefficients,
        rank: 0,
      };
    });

    // Calcul du rang via moyenne générale
    const sorted = [...summaries].sort((a, b) => b.generalAverage - a.generalAverage);
    sorted.forEach((s, idx) => {
      s.rank = idx + 1;
    });

    setSummaries(sorted);
    setComputing(false);
    push('success', `Bulletins calculés pour ${sorted.length} élève(s) (${selectedPeriod}).`);
  };

  const cardFor = (summary: StudentSummary): ReportCardData => {
    const c = classes.find((x) => x.id === selectedClassId);
    return {
      studentFirstName: summary.student.first_name,
      studentLastName: summary.student.last_name,
      matricule: summary.student.matricule,
      className: c?.name || '',
      classSize: students.length,
      rank: summary.rank,
      trimester: selectedPeriod,
      generalAverage: summary.generalAverage,
      totalWeightedPoints: summary.totalWeightedPoints,
      totalCoefficients: summary.totalCoefficients,
      subjects: summary.subjects,
      decision: getDecision(summary.generalAverage),
      directorAppreciation: getDecision(summary.generalAverage),
    };
  };

  const schoolInfo = useMemo(() => ({
    name: school?.name || 'Établissement',
    address: school?.address || null,
    phone: school?.phone || null,
    email: school?.email || null,
    primaryColor: school?.primary_color || '#2563EB',
    year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  }), [school]);

  const downloadOne = (summary: StudentSummary) => {
    try {
      downloadReportCard(schoolInfo, cardFor(summary));
      push('success', `Bulletin de ${summary.student.first_name} ${summary.student.last_name} téléchargé.`);
    } catch (e) {
      push('error', 'Échec de la génération PDF.');
    }
  };

  const downloadAll = () => {
    try {
      const doc = generateAllReportCardsPdf(schoolInfo, summaries.map(cardFor));
      if (doc) {
        doc.save(`bulletins_${selectedClassId ? (classes.find((c) => c.id === selectedClassId)?.name || 'classe') : 'classes'}_${selectedPeriod.replace(/\s+/g, '_')}.pdf`);
        push('success', `PDF fusionné (${summaries.length} bulletins) téléchargé.`);
      }
    } catch (e) {
      push('error', 'Échec de la génération du PDF fusionné.');
    }
  };

  const totalEntered = useMemo(() => {
    const count = summaries.reduce((acc, s) => acc + s.subjects.filter((x) => x.studentAvg !== null).length, 0);
    return count;
  }, [summaries]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <DashToastStack toasts={toasts} onDismiss={dismiss} />

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href={`/${schoolSlug}/dashboard/grades`} className="p-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition">
              <ArrowLeft className="h-4 w-4 text-slate-300" />
            </Link>
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
              <FileText className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Bulletins Scolaires</h1>
              <p className="text-sm text-slate-400 mt-0.5">Génération et téléchargement par classe et par période.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/${schoolSlug}/dashboard/grades`}
            className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium transition">
            <ArrowLeft className="h-4 w-4 text-indigo-400" />
            Retour
          </Link>
        </div>
      </div>

      {/* Boutons de génération */}
      <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Classe</label>
            <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full p-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-200 font-medium outline-none focus:ring-2 focus:ring-indigo-500">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Période</label>
            <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full p-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-200 font-medium outline-none focus:ring-2 focus:ring-indigo-500">
              {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={computeSummaries}
              disabled={computing}
              className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700/60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition"
            >
              {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
              {computing ? 'Calcul en cours…' : 'Calculer les bulletins'}
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {summaries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
            <div className="inline-flex p-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 mb-3">
              <Users className="h-5 w-5 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white leading-none">{summaries.length}</p>
            <p className="text-xs text-slate-400 mt-1.5">Élèves</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
            <div className="inline-flex p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 mb-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-white leading-none">{totalEntered}</p>
            <p className="text-xs text-slate-400 mt-1.5">Notes saisies</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
            <div className="inline-flex p-2 rounded-xl border border-sky-500/30 bg-sky-500/10 mb-3">
              <TrendingUp className="h-5 w-5 text-sky-400" />
            </div>
            <p className="text-2xl font-bold text-white leading-none">
              {(summaries.reduce((a, s) => a + s.generalAverage, 0) / (summaries.length || 1)).toFixed(2)}
            </p>
            <p className="text-xs text-slate-400 mt-1.5">Moy. générale classe</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
            <div className="inline-flex p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 mb-3">
              <FileDown className="h-5 w-5 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-white leading-none">{summaries.length}</p>
            <p className="text-xs text-slate-400 mt-1.5">Bulletins à exporter</p>
          </div>
        </div>
      )}

      {/* Actions PDF */}
      {summaries.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            {locked ? (
              <span className="inline-flex items-center gap-1.5 text-amber-400">
                <Lock className="h-4 w-4" /> Trimestre 3 : bulletins finals verrouillés.
              </span>
            ) : (
              <span className="text-slate-400">Filtrez par élève pour télécharger un bulletin individuel.</span>
            )}
          </div>
          <button
            onClick={downloadAll}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition"
          >
            <Download className="h-4 w-4" />
            Télécharger tous les bulletins (fusionnés)
          </button>
        </div>
      )}

      {/* Table des moyennes */}
      {summaries.length > 0 ? (
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-4 w-28 font-semibold">Rang</th>
                  <th className="p-4 font-semibold">Élève</th>
                  <th className="p-4 font-semibold">Matricule</th>
                  <th className="p-4 font-semibold">Moy. générale</th>
                  <th className="p-4 font-semibold">Décision</th>
                  <th className="p-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {summaries.map((s) => (
                  <tr key={s.student.id} className="hover:bg-slate-700/40">
                    <td className="p-4">
                      <span className={`inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-lg text-xs font-bold ${
                        s.rank === 1 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-700 text-slate-300'
                      }`}>
                        {s.rank}ᵉ
                      </span>
                    </td>
                    <td className="p-4 font-medium text-slate-100">{s.student.first_name} {s.student.last_name}</td>
                    <td className="p-4 font-mono text-xs text-slate-400">{s.student.matricule}</td>
                    <td className="p-4">
                      <span className={`text-sm font-bold ${s.generalAverage >= 10 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {s.generalAverage.toFixed(2)} / 20
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`text-xs font-semibold inline-flex px-2.5 py-1 rounded-lg ${
                        s.generalAverage >= 16 ? 'bg-violet-500/20 text-violet-400' :
                        s.generalAverage >= 14 ? 'bg-amber-500/20 text-amber-400' :
                        s.generalAverage >= 12 ? 'bg-sky-500/20 text-sky-400' :
                        s.generalAverage >= 10 ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-rose-500/20 text-rose-400'
                      }`}>
                        {s.generalAverage >= 10 ? getDecision(s.generalAverage) : 'Ajourné(e)'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => downloadOne(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 border border-slate-600 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold transition"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        Télécharger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-12 text-center space-y-2">
            <FileText className="h-10 w-10 text-slate-500 mx-auto" />
            <p className="text-slate-200 text-sm font-medium">Aucun bulletin calculé.</p>
            <p className="text-xs text-slate-400">Choisissez une classe et une période, puis cliquez sur « Calculer les bulletins ».</p>
          </div>
        )
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      )}
    </div>
  );
}
