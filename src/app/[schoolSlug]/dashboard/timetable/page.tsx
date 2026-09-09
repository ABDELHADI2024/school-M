'use client';

import React, { useEffect, useState, use, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import { generateTimetableTemplate, exportTimetable } from '@/lib/excel/timetableExcel';
import {
  Clock,
  Plus,
  Download,
  Upload,
  X,
  Save,
  AlertCircle,
  CheckCircle2,
  Building2,
  Users,
  Palette,
  Trash2,
  Edit3,
  FileSpreadsheet,
} from 'lucide-react';

type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6;
type ViewMode = 'class' | 'teacher' | 'room';

interface Teacher { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; specialty: string | null; }
interface Room { id: string; name: string; capacity: number; type: string; }
interface Subject { id: string; name: string; }
interface ClassRow { id: string; name: string; }

interface TimetableSlot {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  room_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  color: string;
  classes?: { name: string };
  subjects?: { name: string };
  teachers?: { first_name: string; last_name: string } | null;
  rooms?: { name: string } | null;
}

const DAYS: { num: DayOfWeek; label: string; short: string }[] = [
  { num: 1, label: 'Lundi', short: 'Lun' },
  { num: 2, label: 'Mardi', short: 'Mar' },
  { num: 3, label: 'Mercredi', short: 'Mer' },
  { num: 4, label: 'Jeudi', short: 'Jeu' },
  { num: 5, label: 'Vendredi', short: 'Ven' },
  { num: 6, label: 'Samedi', short: 'Sam' },
];

const TIME_SLOTS = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

const COLORS = ['#4F46E5', '#7C3AED', '#2563EB', '#0891B2', '#059669', '#D97706', '#DC2626', '#DB2777', '#4338CA', '#0D9488', '#65A30D', '#C2410C'];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export default function TimetablePage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Vue
  const [viewMode, setViewMode] = useState<ViewMode>('class');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');

  // Modale Créneau
  const [isSlotOpen, setIsSlotOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [slotForm, setSlotForm] = useState({
    class_id: '', subject_id: '', teacher_id: '', room_id: '',
    day_of_week: 1, start_time: '08:00', end_time: '09:00', color: '#4F46E5',
  });
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modale Professeur
  const [isTeacherOpen, setIsTeacherOpen] = useState(false);
  const [teacherForm, setTeacherForm] = useState({ first_name: '', last_name: '', email: '', phone: '', specialty: '' });

  // Modale Salle
  const [isRoomOpen, setIsRoomOpen] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: '', capacity: '30', type: 'classroom' });

  // 1. Charger les données
  useEffect(() => {
    async function loadBase() {
      setLoading(true);
      const { data: s } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (s) {
        setSchool(s);
        const [{ data: cls }, { data: sub }, { data: tch }, { data: rm }] = await Promise.all([
          supabase.from('classes').select('id, name').eq('school_id', s.id),
          supabase.from('subjects').select('id, name').eq('school_id', s.id),
          supabase.from('teachers').select('*').eq('school_id', s.id),
          supabase.from('rooms').select('*').eq('school_id', s.id),
        ]);
        if (cls) { setClasses(cls); if (cls.length > 0) setSelectedClassId(cls[0].id); }
        if (sub) setSubjects(sub);
        if (tch) setTeachers(tch);
        if (rm) setRooms(rm);
      }
      setLoading(false);
    }
    loadBase();
  }, [schoolSlug]);

  // 2. Charger les créneaux
  useEffect(() => {
    async function loadSlots() {
      if (!school) return;
      const { data } = await supabase
        .from('timetable_slots')
        .select('*, classes(name), subjects(name), teachers(first_name, last_name), rooms(name)')
        .eq('school_id', school.id);
      if (data) setSlots(data as TimetableSlot[]);
    }
    loadSlots();
  }, [school, reloadKey]);

  // Filtrer les créneaux selon la vue
  const filteredSlots = slots.filter((sl) => {
    if (viewMode === 'class') return sl.class_id === selectedClassId;
    if (viewMode === 'teacher') return sl.teacher_id === selectedTeacherId;
    if (viewMode === 'room') return sl.room_id === selectedRoomId;
    return true;
  });

  // Détecter les conflits
  const detectConflict = (
    teacherId: string | null,
    roomId: string | null,
    day: number,
    startTime: string,
    endTime: string,
    excludeSlotId?: string
  ): string | null => {
    const sMin = timeToMinutes(startTime);
    const eMin = timeToMinutes(endTime);

    for (const sl of slots) {
      if (excludeSlotId && sl.id === excludeSlotId) continue;
      if (sl.day_of_week !== day) continue;

      const slS = timeToMinutes(sl.start_time);
      const slE = timeToMinutes(sl.end_time);

      // Vérifier chevauchement
      if (sMin < slE && eMin > slS) {
        // Conflit professeur
        if (teacherId && sl.teacher_id === teacherId) {
          const tName = sl.teachers ? `${sl.teachers.last_name} ${sl.teachers.first_name}` : 'Professeur';
          return `Conflit : ${tName} est déjà occupé de ${sl.start_time} à ${sl.end_time}`;
        }
        // Conflit salle
        if (roomId && sl.room_id === roomId) {
          const rName = sl.rooms?.name || 'Salle';
          return `Conflit : ${rName} est déjà occupée de ${sl.start_time} à ${sl.end_time}`;
        }
      }
    }
    return null;
  };

  // Ouvrir modale ajout
  const openAddSlot = (day: number, time: string) => {
    setEditingSlot(null);
    setConflictError(null);
    const [h] = time.split(':').map(Number);
    setSlotForm({
      class_id: viewMode === 'class' ? selectedClassId : (classes[0]?.id || ''),
      subject_id: subjects[0]?.id || '',
      teacher_id: '',
      room_id: '',
      day_of_week: day,
      start_time: time,
      end_time: `${String(h + 1).padStart(2, '0')}:00`,
      color: COLORS[(h + day) % COLORS.length],
    });
    setIsSlotOpen(true);
  };

  // Ouvrir modale édition
  const openEditSlot = (slot: TimetableSlot) => {
    setEditingSlot(slot);
    setConflictError(null);
    setSlotForm({
      class_id: slot.class_id,
      subject_id: slot.subject_id,
      teacher_id: slot.teacher_id || '',
      room_id: slot.room_id || '',
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      color: slot.color || '#4F46E5',
    });
    setIsSlotOpen(true);
  };

  // Sauvegarder un créneau
  const handleSaveSlot = async () => {
    if (!school) return;
    setSaving(true);
    setConflictError(null);

    // Vérifier les conflits
    const conflict = detectConflict(
      slotForm.teacher_id || null,
      slotForm.room_id || null,
      slotForm.day_of_week,
      slotForm.start_time,
      slotForm.end_time,
      editingSlot?.id
    );

    if (conflict) {
      setConflictError(conflict);
      setSaving(false);
      return;
    }

    const payload = {
      school_id: school.id,
      class_id: slotForm.class_id,
      subject_id: slotForm.subject_id,
      teacher_id: slotForm.teacher_id || null,
      room_id: slotForm.room_id || null,
      day_of_week: slotForm.day_of_week,
      start_time: slotForm.start_time,
      end_time: slotForm.end_time,
      color: slotForm.color,
    };

    if (editingSlot) {
      await supabase.from('timetable_slots').update(payload).eq('id', editingSlot.id);
    } else {
      await supabase.from('timetable_slots').insert([payload]);
    }

    setSaving(false);
    setIsSlotOpen(false);
    setEditingSlot(null);
    setReloadKey((k) => k + 1);
  };

  // Supprimer un créneau
  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm('Supprimer ce créneau ?')) return;
    await supabase.from('timetable_slots').delete().eq('id', slotId);
    setReloadKey((k) => k + 1);
  };

  // Créer un professeur
  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    const { error } = await supabase.from('teachers').insert([{
      school_id: school.id,
      first_name: teacherForm.first_name,
      last_name: teacherForm.last_name,
      email: teacherForm.email || null,
      phone: teacherForm.phone || null,
      specialty: teacherForm.specialty || null,
    }]);
    if (!error) {
      setIsTeacherOpen(false);
      setTeacherForm({ first_name: '', last_name: '', email: '', phone: '', specialty: '' });
      setReloadKey((k) => k + 1);
    }
  };

  // Créer une salle
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    const { error } = await supabase.from('rooms').insert([{
      school_id: school.id,
      name: roomForm.name,
      capacity: parseInt(roomForm.capacity) || 30,
      type: roomForm.type,
    }]);
    if (!error) {
      setIsRoomOpen(false);
      setRoomForm({ name: '', capacity: '30', type: 'classroom' });
      setReloadKey((k) => k + 1);
    }
  };

  // Export Excel
  const handleExport = () => {
    if (!school) return;
    const viewLabel = viewMode === 'class'
      ? `Classe : ${classes.find((c) => c.id === selectedClassId)?.name || ''}`
      : viewMode === 'teacher'
      ? `Professeur : ${teachers.find((t) => t.id === selectedTeacherId)?.last_name || ''}`
      : `Salle : ${rooms.find((r) => r.id === selectedRoomId)?.name || ''}`;

    const exportData = filteredSlots.map((sl) => ({
      day_of_week: sl.day_of_week,
      start_time: sl.start_time,
      end_time: sl.end_time,
      subject_name: sl.subjects?.name || '',
      teacher_name: sl.teachers ? `${sl.teachers.last_name} ${sl.teachers.first_name}` : '',
      room_name: sl.rooms?.name || '',
      class_name: sl.classes?.name || '',
    }));

    exportTimetable(school.name, viewLabel, DAYS.map((d) => d.label), TIME_SLOTS, exportData);
  };

  const handleDownloadTemplate = () => {
    if (!school) return;
    const currentClass = classes.find((c) => c.id === selectedClassId);
    generateTimetableTemplate(school.name, currentClass?.name || 'Classe', DAYS.map((d) => d.label), TIME_SLOTS);
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-500 text-sm">Chargement de l&apos;emploi du temps...</div>;
  }

  return (
    <div className="max-w-full mx-auto space-y-6 px-4">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Emploi du temps</h1>
          <p className="text-sm text-slate-500">Planning hebdomadaire avec détection de conflits.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsTeacherOpen(true)} className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition">
            <Users className="h-4 w-4" /> Prof
          </button>
          <button onClick={() => setIsRoomOpen(true)} className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition">
            <Building2 className="h-4 w-4" /> Salle
          </button>
          <button onClick={handleDownloadTemplate} className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition">
            <Download className="h-4 w-4" /> Canevas
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition">
            <FileSpreadsheet className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* Sélecteurs */}
      <div className="flex flex-wrap items-end gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {([['class', 'Par classe'], ['teacher', 'Par professeur'], ['room', 'Par salle']] as [ViewMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${viewMode === mode ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === 'class' && (
          <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}
            className="p-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 font-medium text-slate-700 focus:outline-none">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {viewMode === 'teacher' && (
          <select value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)}
            className="p-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 font-medium text-slate-700 focus:outline-none">
            <option value="">Sélectionner un professeur</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.last_name} {t.first_name}</option>)}
          </select>
        )}
        {viewMode === 'room' && (
          <select value={selectedRoomId} onChange={(e) => setSelectedRoomId(e.target.value)}
            className="p-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 font-medium text-slate-700 focus:outline-none">
            <option value="">Sélectionner une salle</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>

      {/* Grille hebdomadaire */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
        <table className="w-full text-xs border-collapse min-w-[800px]">
          <thead>
            <tr>
              <th className="w-20 p-2 bg-slate-50 border border-slate-200 text-slate-600 font-semibold sticky left-0 z-10">Heure</th>
              {DAYS.map((d) => (
                <th key={d.num} className="p-2 bg-slate-50 border border-slate-200 text-slate-600 font-semibold text-center min-w-[120px]">
                  <span className="hidden sm:inline">{d.label}</span>
                  <span className="sm:hidden">{d.short}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((time, ti) => {
              const [h] = time.split(':').map(Number);
              const nextTime = TIME_SLOTS[ti + 1] || `${String(h + 1).padStart(2, '0')}:00`;
              return (
                <tr key={time} className="group">
                  <td className="p-2 bg-slate-50 border border-slate-200 font-mono text-slate-600 font-semibold text-center sticky left-0 z-10">
                    {time}
                  </td>
                  {DAYS.map((d) => {
                    const cellSlot = filteredSlots.find(
                      (sl) => sl.day_of_week === d.num && sl.start_time === time
                    );

                    return (
                      <td
                        key={d.num}
                        className="border border-slate-200 p-1 align-top min-h-[60px] relative"
                      >
                        {cellSlot ? (
                          <div
                            className="rounded-lg p-2 cursor-pointer hover:opacity-90 transition group/slot"
                            style={{ backgroundColor: cellSlot.color || '#4F46E5' }}
                            onClick={() => openEditSlot(cellSlot)}
                          >
                            <div className="font-bold text-white text-xs leading-tight">{cellSlot.subjects?.name || '—'}</div>
                            {cellSlot.teachers && (
                              <div className="text-white/80 text-[10px] mt-0.5">{cellSlot.teachers.last_name} {cellSlot.teachers.first_name}</div>
                            )}
                            {cellSlot.rooms && (
                              <div className="text-white/70 text-[10px]">{cellSlot.rooms.name}</div>
                            )}
                            <div className="text-white/60 text-[10px]">{cellSlot.start_time}–{cellSlot.end_time}</div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteSlot(cellSlot.id); }}
                              className="absolute top-1 right-1 opacity-0 group-hover/slot:opacity-100 text-white/70 hover:text-white transition"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => openAddSlot(d.num, time)}
                            className="w-full h-full min-h-[56px] rounded-lg border border-dashed border-transparent hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-center opacity-0 group-hover:opacity-100"
                          >
                            <Plus className="h-4 w-4 text-indigo-400" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ===== MODALES ===== */}

      {/* Modale Créneau */}
      {isSlotOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800">{editingSlot ? 'Modifier le créneau' : 'Nouveau créneau'}</h3>
              <button onClick={() => { setIsSlotOpen(false); setEditingSlot(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {conflictError && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-xs">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{conflictError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Classe</label>
                <select value={slotForm.class_id} onChange={(e) => setSlotForm({ ...slotForm, class_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none">
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Matière</label>
                <select value={slotForm.subject_id} onChange={(e) => setSlotForm({ ...slotForm, subject_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none">
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Professeur</label>
                <select value={slotForm.teacher_id} onChange={(e) => setSlotForm({ ...slotForm, teacher_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none">
                  <option value="">Aucun</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.last_name} {t.first_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Salle</label>
                <select value={slotForm.room_id} onChange={(e) => setSlotForm({ ...slotForm, room_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none">
                  <option value="">Aucune</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jour</label>
                <select value={slotForm.day_of_week} onChange={(e) => setSlotForm({ ...slotForm, day_of_week: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none">
                  {DAYS.map((d) => <option key={d.num} value={d.num}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Début</label>
                <input type="time" value={slotForm.start_time} step="900"
                  onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fin</label>
                <input type="time" value={slotForm.end_time} step="900"
                  onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Couleur</label>
              <div className="flex items-center gap-2">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setSlotForm({ ...slotForm, color: c })}
                    className={`w-6 h-6 rounded-full border-2 transition ${slotForm.color === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {editingSlot && (
                <button onClick={() => { handleDeleteSlot(editingSlot.id); setIsSlotOpen(false); }}
                  className="px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg font-medium mr-auto">Supprimer</button>
              )}
              <button onClick={() => { setIsSlotOpen(false); setEditingSlot(null); }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Annuler</button>
              <button onClick={handleSaveSlot} disabled={saving}
                className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg font-medium shadow-sm transition flex items-center gap-2">
                <Save className="h-4 w-4" /> {saving ? 'Enregistrement...' : editingSlot ? 'Modifier' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Professeur */}
      {isTeacherOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800">Nouveau professeur</h3>
              <button onClick={() => setIsTeacherOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateTeacher} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom</label>
                  <input type="text" required value={teacherForm.first_name} onChange={(e) => setTeacherForm({ ...teacherForm, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nom</label>
                  <input type="text" required value={teacherForm.last_name} onChange={(e) => setTeacherForm({ ...teacherForm, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                <input type="email" value={teacherForm.email} onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Téléphone</label>
                  <input type="text" value={teacherForm.phone} onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Spécialité</label>
                  <input type="text" value={teacherForm.specialty} onChange={(e) => setTeacherForm({ ...teacherForm, specialty: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsTeacherOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Annuler</button>
                <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium">Créer</button>
              </div>
            </form>

            {teachers.length > 0 && (
              <div className="border-t border-slate-100 pt-4 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-600 mb-2">Professeurs ({teachers.length}) :</p>
                <div className="space-y-1">
                  {teachers.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-slate-50">
                      <span className="text-slate-700 font-medium">{t.last_name} {t.first_name}</span>
                      <span className="text-slate-400">{t.specialty || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modale Salle */}
      {isRoomOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800">Nouvelle salle</h3>
              <button onClick={() => setIsRoomOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nom de la salle</label>
                <input type="text" required placeholder="Ex: Salle 101" value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Capacité</label>
                  <input type="number" min="1" value={roomForm.capacity}
                    onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select value={roomForm.type} onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none">
                    <option value="classroom">Salle de classe</option>
                    <option value="lab">Laboratoire</option>
                    <option value="sport">Salle de sport</option>
                    <option value="library">Bibliothèque</option>
                    <option value="computer">Salle informatique</option>
                    <option value="auditorium">Auditorium</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsRoomOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Annuler</button>
                <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium">Créer</button>
              </div>
            </form>

            {rooms.length > 0 && (
              <div className="border-t border-slate-100 pt-4 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-600 mb-2">Salles ({rooms.length}) :</p>
                <div className="space-y-1">
                  {rooms.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-slate-50">
                      <span className="text-slate-700 font-medium">{r.name}</span>
                      <span className="text-slate-400">{r.capacity} places · {r.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
