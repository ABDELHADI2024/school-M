'use client';

import React, { useEffect, useMemo, useRef, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School } from '@/types';
import {
  Users,
  Search,
  Plus,
  Download,
  Upload,
  FileSpreadsheet,
  MoreVertical,
  Pencil,
  Eye,
  Trash2,
  AlertTriangle,
  Loader2,
  GraduationCap,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { DashToastStack, useDashToasts } from '@/components/dashboard-toast';
import { downloadBlob } from '@/lib/excel/studentsExcel';

interface ClassRow {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  gender: string;
  birth_date: string | null;
  status: string;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  class_id: string | null;
  classes?: { name: string } | null;
}

interface MyRole {
  role: string;
}

const GENDER_STYLE: Record<string, string> = {
  M: 'bg-blue-100 text-blue-700 border-blue-200',
  F: 'bg-pink-100 text-pink-700 border-pink-200',
};

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  active: { label: 'Actif', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  suspended: { label: 'Suspendu', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  inactive: { label: 'Inactif', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const INITIAL_FORM = {
  matricule: '',
  first_name: '',
  last_name: '',
  gender: 'M',
  birth_date: '',
  class_id: '',
  parent_name: '',
  parent_phone: '',
  parent_email: '',
  status: 'active',
};

export default function StudentsPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();
  const { toasts, push, dismiss } = useDashToasts();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [schoolId, setSchoolId] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [reloadKey, setReloadKey] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Modale d'inscription unitaire
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formSaving, setFormSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Modale d'import Excel
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [importing, setImporting] = useState(false);

  // Modale de suppression
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isReadOnly = role === 'teacher';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

      const [{ data: classesData }, { data: studentsData }] = await Promise.all([
        supabase.from('classes').select('id, name').eq('school_id', schoolData.id).order('name'),
        supabase
          .from('students')
          .select('*, classes(name)')
          .eq('school_id', schoolData.id)
          .order('created_at', { ascending: false }),
      ]);

      if (!cancelled) {
        setSchool(schoolData);
        setSchoolId(schoolData.id);
        setRole(currentRole);
        if (classesData) setClasses(classesData as ClassRow[]);
        if (studentsData) setStudents(studentsData as StudentRow[]);
        setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [schoolSlug, supabase, reloadKey]);

  const classMap = useMemo(() => {
    const m = new Map<string, string>();
    classes.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [classes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const matchSearch =
        !q ||
        `${s.first_name} ${s.last_name} ${s.matricule}`.toLowerCase().includes(q);
      const matchClass = filterClass === 'ALL' || s.class_id === filterClass;
      const matchStatus = filterStatus === 'ALL' || s.status === filterStatus;
      return matchSearch && matchClass && matchStatus;
    });
  }, [students, search, filterClass, filterStatus]);

  const kpis = useMemo(() => {
    const total = students.length;
    const girls = students.filter((s) => s.gender?.toUpperCase() === 'F').length;
    const boys = total - girls;
    const activeClasses = new Set(students.map((s) => s.class_id).filter(Boolean)).size;
    return { total, girls, boys, activeClasses };
  }, [students]);

  // ── Canevas ────────────────────────────────────────────────────────────────
  const handleDownloadTemplate = useCallback(async () => {
    try {
      const res = await fetch(`/api/school/students/template?schoolId=${encodeURIComponent(schoolId)}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        push('error', payload?.error || 'Impossible de générer le canevas.');
        return;
      }
      const buffer = await res.arrayBuffer();
      downloadBlob(buffer, `canevas_eleves_${school?.name?.toLowerCase().replace(/\s+/g, '_') || 'ecole'}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      push('success', 'Canevas téléchargé. Remplissez puis importez-le.');
    } catch {
      push('error', 'Erreur réseau lors du téléchargement du canevas.');
    }
  }, [schoolId, school, push]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async (format: 'xlsx' | 'csv') => {
    try {
      const params = new URLSearchParams({ schoolId });
      if (filterClass !== 'ALL') params.set('classId', filterClass);
      params.set('format', format);
      const res = await fetch(`/api/school/students/export?${params.toString()}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        push('error', payload?.error || 'Export impossible.');
        return;
      }
      const buffer = await res.arrayBuffer();
      downloadBlob(
        buffer,
        `effectifs_${school?.name?.toLowerCase().replace(/\s+/g, '_') || 'ecole'}.${format}`,
        format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      push('success', `Export ${format.toUpperCase()} généré.`);
    } catch {
      push('error', 'Erreur réseau lors de l’export.');
    }
  }, [schoolId, filterClass, school, push]);

  // ── Formulaire unitaire ────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setIsFormOpen(true);
  }

  function openEdit(s: StudentRow) {
    setEditingId(s.id);
    setForm({
      matricule: s.matricule,
      first_name: s.first_name,
      last_name: s.last_name,
      gender: s.gender?.toUpperCase() || 'M',
      birth_date: s.birth_date || '',
      class_id: s.class_id || '',
      parent_name: s.parent_name || '',
      parent_phone: s.parent_phone || '',
      parent_email: s.parent_email || '',
      status: s.status || 'active',
    });
    setOpenMenuId(null);
    setIsFormOpen(true);
  }

  async function handleSaveForm(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    setFormSaving(true);
    try {
      const payload = {
        school_id: schoolId,
        class_id: form.class_id || null,
        matricule: form.matricule.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        gender: form.gender.toUpperCase(),
        birth_date: form.birth_date || null,
        parent_name: form.parent_name.trim() || null,
        parent_phone: form.parent_phone.trim() || null,
        parent_email: form.parent_email.trim() || null,
        status: form.status,
      };
      if (editingId) {
        const { error } = await supabase.from('students').update(payload).eq('id', editingId);
        if (error) throw error;
        push('success', 'Élève mis à jour.');
      } else {
        const { error } = await supabase.from('students').insert(payload);
        if (error) throw error;
        push('success', 'Élève inscrit avec succès.');
      }
      setIsFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setFormSaving(false);
    }
  }

  // ── Import Excel ───────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      push('error', 'Format non supporté. Utilisez un fichier .xlsx.');
      return;
    }
    setImportFile(file);
    // Prévisualisation des 5 premières lignes côté client (simple)
    try {
      const buffer = await file.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ExcelJS = (await import('exceljs')).default as any;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      const headers: string[] = [];
      const previewRows: string[][] = [];
      ws.getRow(1).eachCell((cell: { value: unknown }) => headers.push(String(cell.value ?? '')));
      let count = 0;
      ws.eachRow((row: { values: unknown[] }, rowNumber: number) => {
        if (rowNumber === 1) return;
        if (count >= 5) return;
        const vals = (row.values as unknown[]).slice(1).map((v) => String(v ?? ''));
        previewRows.push(vals);
        count++;
      });
      setPreview({ headers, rows: previewRows });
    } catch {
      setPreview(null);
    }
  }

  async function handleImport() {
    if (!importFile || !schoolId) return;
    setImporting(true);
    setImportProgress(15);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res = await fetch(`/api/school/students/import?schoolId=${encodeURIComponent(schoolId)}`, {
        method: 'POST',
        body: fd,
      });
      setImportProgress(80);
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        push('error', payload?.error || 'Import impossible.');
        return;
      }
      setImportProgress(100);
      const report = payload.report;
      push(
        report.rejected > 0 ? 'info' : 'success',
        `Import terminé : ${report.inserted} inséré(s), ${report.updated} mis à jour, ${report.rejected} rejeté(s).`
      );
      setIsImportOpen(false);
      setImportFile(null);
      setPreview(null);
      setReloadKey((k) => k + 1);
    } catch {
      push('error', 'Erreur réseau lors de l’import.');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  // ── Suppression ────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('students').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      push('success', `${deleteTarget.first_name} ${deleteTarget.last_name} supprimé.`);
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setDeleting(false);
    }
  }

  // ── Dropzone de la modale d'import ────────────────────────────────────────
  const [dragging, setDragging] = useState(false);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-800">Inscriptions & Élèves</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Gérez les effectifs, importez en masse ou consultez vos listes.</p>
        </div>
        {!isReadOnly && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            Inscrire un élève
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total inscrits', value: kpis.total, icon: Users, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Filles', value: kpis.girls, icon: Users, color: 'text-pink-600 bg-pink-50' },
          { label: 'Garçons', value: kpis.boys, icon: Users, color: 'text-blue-600 bg-blue-50' },
          { label: 'Classes actives', value: kpis.activeClasses, icon: GraduationCap, color: 'text-emerald-600 bg-emerald-50' },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <div className={`${k.color} p-2.5 rounded-xl`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 leading-none">{k.value}</p>
                <p className="text-xs text-slate-500 mt-1">{k.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Barre d'outils */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Rechercher par nom, prénom ou matricule…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full py-2.5 text-sm outline-none bg-transparent text-slate-700"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-600 font-medium outline-none"
            >
              <option value="ALL">Toutes les classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-600 font-medium outline-none"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="suspended">Suspendu</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition"
          >
            <Download className="h-4 w-4" />
            Canevas
          </button>
          {!isReadOnly && (
            <button
              onClick={() => { setImportFile(null); setPreview(null); setIsImportOpen(true); }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-600 transition"
            >
              <Upload className="h-4 w-4" />
              Importer
            </button>
          )}
          <button
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Exporter XLSX
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition"
          >
            <FileSpreadsheet className="h-4 w-4 text-slate-400" />
            Exporter CSV
          </button>
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des effectifs…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Users className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-slate-600 font-medium text-sm">Aucun élève trouvé.</p>
            <p className="text-xs text-slate-400">Utilisez « Canevas » puis « Importer » pour remplir votre effectif.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Élève</th>
                  <th className="px-4 py-3 font-semibold">Matricule</th>
                  <th className="px-4 py-3 font-semibold">Classe</th>
                  <th className="px-4 py-3 font-semibold">Tuteur</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => {
                  const genderCls = GENDER_STYLE[s.gender?.toUpperCase() || ''] || 'bg-slate-100 text-slate-600 border-slate-200';
                  const statusStyle = STATUS_STYLE[s.status || 'active'] || STATUS_STYLE.active;
                  const bg = `bg-gradient-to-br ${s.gender?.toUpperCase() === 'F' ? 'from-pink-500 to-rose-500' : 'from-blue-500 to-indigo-500'}`;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-full ${bg} text-white flex items-center justify-center font-bold text-xs shrink-0`}>
                            {(s.first_name[0] || '') + (s.last_name[0] || '')}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{s.first_name} {s.last_name}</p>
                            <span className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-bold border ${genderCls}`}>
                              {s.gender?.toUpperCase() === 'F' ? 'Fille' : s.gender?.toUpperCase() === 'M' ? 'Garçon' : '—'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded-md">
                          {s.matricule}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {s.classes?.name ? (
                          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold">
                            {s.classes.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Sans classe</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 truncate max-w-[160px]">{s.parent_name || '—'}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[160px]">{s.parent_phone || ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${statusStyle.cls}`}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block" ref={openMenuId === s.id ? menuRef : undefined}>
                          <button
                            onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                            aria-label="Menu"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuId === s.id && (
                            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                              {!isReadOnly && (
                                <button
                                  onClick={() => openEdit(s)}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                                >
                                  <Pencil className="h-4 w-4 text-indigo-500" />
                                  Éditer
                                </button>
                              )}
                              <Link
                                href={`/${schoolSlug}/dashboard/students/${s.id}`}
                                onClick={() => setOpenMenuId(null)}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                              >
                                <Eye className="h-4 w-4 text-sky-500" />
                                Fiche élève
                              </Link>
                              {!isReadOnly && (
                                <>
                                  <div className="border-t border-slate-100 my-1" />
                                  <button
                                    onClick={() => { setOpenMenuId(null); setDeleteTarget(s); }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Supprimer
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale d'inscription unitaire */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800">{editingId ? 'Modifier l’élève' : 'Inscrire un élève'}</h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveForm} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Matricule *</label>
                  <input required value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Genre</label>
                  <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none">
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nom *</label>
                  <input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Prénom *</label>
                  <input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Date de naissance</label>
                  <input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Classe</label>
                  <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none">
                    <option value="">Sans classe</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nom du tuteur</label>
                  <input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Téléphone tuteur</label>
                  <input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Email tuteur</label>
                  <input type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Statut</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none">
                    <option value="active">Actif</option>
                    <option value="suspended">Suspendu</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition">
                  Annuler
                </button>
                <button type="submit" disabled={formSaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-medium shadow-sm transition">
                  {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {formSaving ? 'Enregistrement…' : (editingId ? 'Enregistrer' : 'Inscrire')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale d'import Excel */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <h3>Importer des élèves</h3>
              </div>
              <button onClick={() => { setIsImportOpen(false); setImportFile(null); setPreview(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!importFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const fake = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                    void handleFileChange(fake);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center space-y-4 cursor-pointer transition ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:border-indigo-400'}`}
              >
                <FileSpreadsheet className="h-12 w-12 text-emerald-600 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800">Glissez votre fichier .xlsx ici</p>
                  <p className="text-xs text-slate-500">ou cliquez pour parcourir — téléchargez le canevas si besoin</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
                  className="inline-flex items-center gap-2 text-xs font-medium text-indigo-700 hover:text-indigo-900 transition">
                  <Download className="h-3.5 w-3.5" />
                  Télécharger le canevas
                </button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                    <span className="font-medium text-slate-700">{importFile.name}</span>
                  </div>
                  <button onClick={() => { setImportFile(null); setPreview(null); }} className="text-xs text-slate-500 hover:text-slate-700">
                    Changer de fichier
                  </button>
                </div>

                {preview && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Prévisualisation (5 premières lignes)</p>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <tr>{preview.headers.map((h, i) => <th key={i} className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {preview.rows.map((row, i) => (
                            <tr key={i}>{row.map((cell, j) => <td key={j} className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{cell}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importProgress !== null && (
                  <div className="space-y-1">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${importProgress}%` }} />
                    </div>
                    <p className="text-xs text-slate-500">Import en cours… {importProgress}%</p>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                  <button onClick={() => setIsImportOpen(false)}
                    className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition">
                    Annuler
                  </button>
                  <button onClick={handleImport} disabled={importing}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-medium shadow-sm transition">
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {importing ? 'Importation…' : 'Importer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modale de suppression */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="bg-rose-50 p-2.5 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Supprimer l’élève</h3>
                <p className="text-sm text-slate-500">Cette action est irréversible.</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-700">
                Voulez-vous vraiment supprimer <strong className="text-slate-900">{deleteTarget.first_name} {deleteTarget.last_name}</strong> ({deleteTarget.matricule}) ?
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition">
                Annuler
              </button>
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
