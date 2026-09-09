'use client';

import React, { useEffect, useState, use, useRef, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  generateAttendanceTemplate,
  generateAttendanceReport,
  parseAttendanceExcel,
  AttendanceExcelRow,
} from '@/lib/excel/attendanceExcel';
import {
  CalendarCheck,
  Download,
  Upload,
  Save,
  CheckCircle2,
  X,
  FileSpreadsheet,
  AlertCircle,
  Check,
  Clock,
  FileX,
  Filter,
  Users,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';

type Status = 'present' | 'absent' | 'late' | 'excused';

interface StudentRow {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
}

interface AttendanceRecord {
  student_id: string;
  status: Status;
  note: string;
}

const STATUS_CONFIG: Record<Status, { label: string; short: string; activeColor: string; chip: string; icon: React.ElementType }> = {
  present: { label: 'Présent', short: 'P', activeColor: 'bg-emerald-600 text-white border-emerald-400', chip: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: Check },
  absent: { label: 'Absent', short: 'A', activeColor: 'bg-rose-600 text-white border-rose-400', chip: 'text-rose-400 bg-rose-500/10 border-rose-500/30', icon: FileX },
  late: { label: 'Retard', short: 'R', activeColor: 'bg-amber-600 text-white border-amber-400', chip: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: Clock },
  excused: { label: 'Justifié', short: 'J', activeColor: 'bg-blue-600 text-white border-blue-400', chip: 'text-blue-400 bg-blue-500/10 border-blue-500/30', icon: CheckCircle2 },
};

export default function AttendancePage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toasts, push, dismiss } = useDashToasts();

  const [school, setSchool] = useState<School | null>(null);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [role, setRole] = useState('');

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [selectedSlot, setSelectedSlot] = useState('');

  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<AttendanceExcelRow[]>([]);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

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
        .eq('class_id', selectedClassId)
        .order('last_name');

      if (st) {
        setStudents(st);
        const { data: att } = await supabase
          .from('attendance')
          .select('student_id, status, note')
          .eq('school_id', school.id)
          .eq('class_id', selectedClassId)
          .eq('date', selectedDate);

        const map: Record<string, AttendanceRecord> = {};
        st.forEach((s) => {
          const existing = att?.find((a) => a.student_id === s.id);
          map[s.id] = {
            student_id: s.id,
            status: existing?.status || 'present',
            note: existing?.note || '',
          };
        });
        setAttendanceMap(map);
      }
    }
    loadClassData();
  }, [school, selectedClassId, selectedDate, supabase]);

  const setStatus = (studentId: string, status: Status) => {
    setAttendanceMap((prev) => ({ ...prev, [studentId]: { ...prev[studentId], status } }));
  };

  const setNote = (studentId: string, note: string) => {
    setAttendanceMap((prev) => ({ ...prev, [studentId]: { ...prev[studentId], note } }));
  };

  const markAll = (status: Status) => {
    const newMap: Record<string, AttendanceRecord> = {};
    Object.keys(attendanceMap).forEach((sid) => {
      newMap[sid] = { student_id: sid, status, note: attendanceMap[sid]?.note || '' };
    });
    setAttendanceMap(newMap);
  };

  const handleSave = useCallback(async () => {
    if (!school || !selectedClassId) return;
    setSaving(true);
    setSaveSuccess(false);

    const { data: { user } } = await supabase.auth.getUser();
    const recordedBy = user?.id ?? null;

    const rowsToUpsert = Object.entries(attendanceMap).map(([studentId, data]) => ({
      school_id: school.id,
      class_id: selectedClassId,
      student_id: studentId,
      date: selectedDate,
      status: data.status,
      note: data.note || null,
      recorded_by: recordedBy,
    }));

    const { error } = await supabase
      .from('attendance')
      .upsert(rowsToUpsert, { onConflict: 'class_id,student_id,date' });

    setSaving(false);
    if (error) {
      push('error', `Erreur d'enregistrement : ${error.message}`);
    } else {
      setSaveSuccess(true);
      push('success', `${rowsToUpsert.length} présences enregistrées pour le ${selectedDate}.`);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  }, [school, selectedClassId, selectedDate, attendanceMap, supabase, push]);

  const handleDownloadTemplate = () => {
    if (!school) return;
    const currentClass = classes.find((c) => c.id === selectedClassId);
    if (!currentClass) return;
    generateAttendanceTemplate(school.name, currentClass.name, selectedDate, students);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = await parseAttendanceExcel(file);
      setParsedRows(rows);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Erreur lors de la lecture du fichier Excel.');
    }
  };

  const handleApplyExcel = () => {
    const newMap = { ...attendanceMap };
    parsedRows.forEach((row) => {
      if (!row.isValid) return;
      const st = students.find((s) => s.matricule.toLowerCase() === row.matricule.toLowerCase());
      if (st && newMap[st.id]) {
        newMap[st.id] = {
          ...newMap[st.id],
          status: row.status,
          note: row.note || newMap[st.id].note,
        };
      }
    });
    setAttendanceMap(newMap);
    push('success', 'Grille appliquée avec succès.');
    setIsImportOpen(false);
    setParsedRows([]);
  };

  const handleGenerateReport = async () => {
    if (!school || !selectedClassId) return;
    const currentClass = classes.find((c) => c.id === selectedClassId);
    if (!currentClass) return;

    const startDate = `${reportMonth}-01`;
    const [year, month] = reportMonth.split('-').map(Number);
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const { data: attData } = await supabase
      .from('attendance')
      .select('student_id, status')
      .eq('school_id', school.id)
      .eq('class_id', selectedClassId)
      .gte('date', startDate)
      .lte('date', endDate);

    const totals: Record<string, { presences: number; absences: number; lates: number; excused: number }> = {};
    students.forEach((s) => {
      totals[s.id] = { presences: 0, absences: 0, lates: 0, excused: 0 };
    });

    attData?.forEach((a) => {
      if (!totals[a.student_id]) return;
      if (a.status === 'present') totals[a.student_id].presences++;
      else if (a.status === 'absent') totals[a.student_id].absences++;
      else if (a.status === 'late') totals[a.student_id].lates++;
      else if (a.status === 'excused') totals[a.student_id].excused++;
    });

    const reportRows = students.map((s) => ({
      matricule: s.matricule,
      student_name: `${s.last_name} ${s.first_name}`,
      total_presences: totals[s.id]?.presences || 0,
      total_absences: totals[s.id]?.absences || 0,
      total_lates: totals[s.id]?.lates || 0,
      total_excused: totals[s.id]?.excused || 0,
    }));

    generateAttendanceReport(school.name, currentClass.name, reportMonth, reportRows);
    push('success', 'Rapport mensuel généré.');
    setIsReportOpen(false);
  };

  const currentClass = classes.find((c) => c.id === selectedClassId);

  const counts = useMemo(
    () =>
      Object.values(attendanceMap).reduce(
        (acc, r) => {
          acc[r.status]++;
          return acc;
        },
        { present: 0, absent: 0, late: 0, excused: 0 }
      ),
    [attendanceMap]
  );

  const total = students.length;
  const presenceRate = total > 0 ? Math.round((counts.present / total) * 100) : 0;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 py-20 text-slate-400 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l&apos;émargement…
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
              <CalendarCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Émargement & Vie scolaire</h1>
              <p className="text-sm text-slate-400 mt-0.5">Appel en classe — présences, retards, absences et justificatifs.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium transition"
          >
            <Download className="h-4 w-4 text-slate-400" />
            Canevas Excel
          </button>
          {!isReadOnly && (
            <button
              onClick={() => setIsImportOpen(true)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition"
            >
              <Upload className="h-4 w-4" />
              Importer Excel
            </button>
          )}
          <button
            onClick={() => setIsReportOpen(true)}
            className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium transition"
          >
            <FileSpreadsheet className="h-4 w-4 text-amber-400" />
            Rapport mensuel
          </button>
        </div>
      </div>

      {/* KPIs du jour */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 mb-3">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white leading-none">{presenceRate}%</p>
          <p className="text-xs text-slate-400 mt-1.5">Taux de présence</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-rose-500/30 bg-rose-500/10 mb-3">
            <FileX className="h-5 w-5 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-white leading-none">{counts.absent}</p>
          <p className="text-xs text-slate-400 mt-1.5">Absents</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 mb-3">
            <Clock className="h-5 w-5 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white leading-none">{counts.late}</p>
          <p className="text-xs text-slate-400 mt-1.5">Retards</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
          <div className="inline-flex p-2 rounded-xl border border-blue-500/30 bg-blue-500/10 mb-3">
            <CheckCircle2 className="h-5 w-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white leading-none">{counts.excused}</p>
          <p className="text-xs text-slate-400 mt-1.5">Justifiés</p>
        </div>
      </div>

      {/* Sélecteurs */}
      <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 space-y-4 shadow-lg">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Classe</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full p-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-200 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {classes.length === 0 && <option>Aucune classe</option>}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full p-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-200 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Créneau / Matière</label>
            <input
              type="text"
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              placeholder="Ex : 08h-10h Mathématiques"
              className="w-full p-2.5 bg-slate-900/70 border border-slate-600 rounded-xl text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/60 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-slate-500" />
            <span className="text-xs text-slate-400 font-medium">Tous marquer :</span>
            {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={key}
                  onClick={() => markAll(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${cfg.chip} hover:opacity-80`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-700/60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveSuccess ? 'Enregistré !' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          )}
        </div>
      </div>

      {/* Tableau des présences */}
      <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg">
        {students.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Aucun élève dans cette classe. Ajoutez des élèves d&apos;abord.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-4 w-32 font-semibold">Matricule</th>
                  <th className="p-4 font-semibold">Élève</th>
                  <th className="p-4 text-center font-semibold" colSpan={4}>Statut</th>
                  <th className="p-4 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {students.map((st) => {
                  const record = attendanceMap[st.id];
                  const currentCfg = record ? STATUS_CONFIG[record.status] : STATUS_CONFIG.present;
                  return (
                    <tr key={st.id} className="hover:bg-slate-700/40">
                      <td className="p-4 font-mono text-xs text-slate-400">{st.matricule}</td>
                      <td className="p-4 font-medium text-slate-100">
                        <span className="flex items-center gap-2">
                          {st.last_name} {st.first_name}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${currentCfg.chip}`}>
                            {currentCfg.label}
                          </span>
                        </span>
                      </td>
                      <td className="p-2" colSpan={4}>
                        <div className="flex items-center gap-1.5">
                          {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([key, cfg]) => {
                            const Icon = cfg.icon;
                            const isActive = record?.status === key;
                            return (
                              <button
                                key={key}
                                onClick={() => setStatus(st.id, key)}
                                title={cfg.label}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                  isActive
                                    ? `${cfg.activeColor} shadow-sm`
                                    : 'text-slate-400 border-slate-600 hover:bg-slate-700'
                                }`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                                {cfg.short}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="p-4">
                        <input
                          type="text"
                          placeholder="Remarque…"
                          value={record?.note || ''}
                          onChange={(e) => setNote(st.id, e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900/70 border border-slate-600 rounded-lg text-xs text-slate-100 outline-none focus:border-emerald-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale Import Excel */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2 font-bold text-white">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                <h3>Importer l&apos;émargement depuis Excel</h3>
              </div>
              <button onClick={() => { setIsImportOpen(false); setParsedRows([]); }} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            {parsedRows.length === 0 ? (
              <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center space-y-3 bg-slate-800/40">
                <Upload className="h-10 w-10 text-slate-500 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-100">Sélectionnez la feuille d&apos;émargement Excel</p>
                  <p className="text-xs text-slate-500">Statuts acceptés : P (Présent), A (Absent), R (Retard), J (Justifié)</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition"
                >
                  <Upload className="h-4 w-4" />
                  Parcourir mon ordinateur
                </button>
                <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" ref={fileInputRef} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> {parsedRows.filter((r) => r.isValid).length} ligne(s) valide(s)
                  </span>
                  {parsedRows.filter((r) => !r.isValid).length > 0 && (
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" /> {parsedRows.filter((r) => !r.isValid).length} ligne(s) avec erreur
                    </span>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto border border-slate-700 rounded-lg divide-y divide-slate-700/60 text-xs">
                  {parsedRows.map((r, i) => (
                    <div key={i} className={`p-2.5 flex items-center justify-between ${!r.isValid ? 'bg-rose-500/10 text-rose-400' : ''}`}>
                      <span className="font-mono w-24 text-slate-400">{r.matricule}</span>
                      <span className="font-medium flex-1 text-slate-200">{r.student_name}</span>
                      <span className={`font-semibold w-20 text-center ${STATUS_CONFIG[r.status]?.chip || ''}`}>
                        {STATUS_CONFIG[r.status]?.label}
                      </span>
                      {r.error && <span className="text-[10px] text-rose-400 ml-2">{r.error}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setParsedRows([])} className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg font-medium">
                    Changer de fichier
                  </button>
                  <button onClick={handleApplyExcel} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-sm">
                    Appliquer dans la grille
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modale Rapport Mensuel */}
      {isReportOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2 font-bold text-white">
                <FileSpreadsheet className="h-5 w-5 text-amber-400" />
                <h3>Rapport mensuel d&apos;absentéisme</h3>
              </div>
              <button onClick={() => setIsReportOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Mois</label>
              <input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <p className="text-xs text-slate-400">
              Le rapport sera généré pour la classe <strong className="text-slate-100">{currentClass?.name || '—'}</strong> sur le mois sélectionné.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setIsReportOpen(false)} className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg font-medium">
                Annuler
              </button>
              <button onClick={handleGenerateReport} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium shadow-sm">
                Générer le rapport
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
