'use client';

import React, { useCallback, useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { School, ALL_MODULES, PILLIERS, canEditUser, canDelegateTo, delegableModules } from '@/types';
import { generateUserTemplate, generateUserExport, parseUserImport, UserExcelRow } from '@/lib/excel/usersExcel';
import {
  UserPlus, Search, Download, Upload, Shield, ShieldOff,
  X, Check, ChevronDown, Filter, Lock,
} from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'director', label: 'Directeur' },
  { value: 'teacher', label: 'Enseignant' },
  { value: 'staff', label: 'Staff / Secrétariat / CPE / Comptable' },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  school_admin: 'Propriétaire',
  director: 'Directeur',
  staff: 'Personnel',
  teacher: 'Enseignant',
  parent: 'Parent',
  student: 'Élève',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-violet-100 text-violet-700',
  school_admin: 'bg-blue-100 text-blue-700',
  director: 'bg-indigo-100 text-indigo-700',
  staff: 'bg-slate-100 text-slate-700',
  teacher: 'bg-emerald-100 text-emerald-700',
  parent: 'bg-amber-100 text-amber-700',
  student: 'bg-cyan-100 text-cyan-700',
};

interface UserRow {
  profile_id: string;
  user_id: string;
  full_name: string;
  role: string;
  email: string;
  modules: string[];
  is_active: boolean;
}

export default function UsersPage({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const supabase = createClient();

  const [school, setSchool] = useState<School | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<UserRow | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<UserExcelRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [myRole, setMyRole] = useState<string>('');
  const [myModules, setMyModules] = useState<string[]>([]);
  const [schoolEnabledModules, setSchoolEnabledModules] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshUsers = () => setRefreshKey((k) => k + 1);

  // Charge la liste via la route serveur (service_role) : profils + emails et
  // permissions de l'école. Garde la liste affichée tant que le rechargement
  // n'a pas répondu, pour éviter un clignotement "Aucun utilisateur trouvé".
  const fetchUsers = useCallback(async (schoolId: string) => {
    try {
      const res = await fetch(`/api/school/users?schoolId=${encodeURIComponent(schoolId)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const rows: UserRow[] = (data.users || []).map((u: {
          profileId: string;
          userId: string;
          fullName: string;
          email: string | null;
          role: string;
          modules: string[];
          isActive: boolean;
        }) => ({
          profile_id: u.profileId,
          user_id: u.userId,
          full_name: u.fullName,
          role: u.role,
          email: u.email || '—',
          modules: u.modules || [],
          is_active: u.isActive,
        }));
        setUsers(rows);
        return true;
      }
      const data = await res.json().catch(() => ({}));
      console.error('fetchUsers', data.error || res.status);
      setUsers([]);
      return false;
    } catch (err) {
      console.error('fetchUsers', err);
      setUsers([]);
      return false;
    }
  }, []);

  const resolveSchoolId = async (): Promise<string | null> => {
    if (school?.id) return school.id;
    const { data } = await supabase
      .from('schools')
      .select('id')
      .eq('slug', schoolSlug)
      .maybeSingle();
    return data?.id ?? null;
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const { data: s } = await supabase.from('schools').select('*').eq('slug', schoolSlug).single();
      if (!s) { setLoading(false); return; }
      setSchool(s);
      const sid = s.id;

      const { data: myProfile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user!.id)
        .maybeSingle();

      const currentRole = myProfile?.role ?? '';
      setMyRole(currentRole);

      const { data: myMods } = await supabase
        .from('user_modules')
        .select('module_id')
        .eq('user_id', user!.id)
        .eq('school_id', sid);

      const myModIds = (myMods || []).map((m: { module_id: string }) => m.module_id);
      setMyModules(myModIds);

      // Récupère tous les modules activés de l'école (via le client admin
      // du serveur pour contourner la RLS et garantir l'affichage des piliers).
      let enabledIds: string[] = [];
      try {
        const modRes = await fetch(`/api/school/modules?schoolId=${encodeURIComponent(sid)}`, { cache: 'no-store' });
        if (modRes.ok) {
          const modData = await modRes.json();
          enabledIds = modData.modules || [];
        }
      } catch {
        enabledIds = [];
      }
      setSchoolEnabledModules(enabledIds);

      // Charge tout le personnel de l'école (profil + email via auth.users + permissions)
      await fetchUsers(sid);

      setLoading(false);
    }

    loadData();
  }, [schoolSlug, supabase, refreshKey, fetchUsers]);

  const filtered = users.filter((u) => {
    if (!canEditUser(myRole, u.role)) return false;
    const matchSearch = !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const getAvailableModules = (targetRole: string): string[] => {
    // school_admin / super_admin : modules activés de l'école ; tant que l'appel
    // API est en attente (ou échoue), on retombe sur le catalogue par défaut pour
    // que les cases à cocher apparaissent toujours.
    const source =
      myRole === 'school_admin' || myRole === 'super_admin'
        ? schoolEnabledModules.length > 0
          ? schoolEnabledModules
          : ALL_MODULES.map((m) => m.id)
        : myModules;
    return delegableModules(source, myRole, targetRole);
  };

  const handleExport = async () => {
    if (!school) return;
    const buffer = await generateUserExport(school.name, users);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `personnel_${school.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = async () => {
    if (!school) return;
    const buffer = await generateUserTemplate(school.name);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canevas_personnel_${school.name.replace(/\s+/g, '_')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const rows = await parseUserImport(buffer);
    setImportRows(rows);
    setShowImport(true);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    const schoolId = await resolveSchoolId();
    if (!schoolId) {
      alert("Impossible de déterminer l'école. Rechargez la page.");
      return;
    }
    setImporting(true);
    const validRows = importRows.filter((r) => r.isValid);
    for (const row of validRows) {
      const modules = row.modules.split(',').map((m) => m.trim()).filter(Boolean);
      const password = `Temp-${crypto.randomUUID().slice(0, 8)}!`;
      await fetch('/api/school/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId,
          fullName: row.full_name,
          email: row.email,
          password,
          role: row.role,
          modules,
        }),
      }).catch(() => {});
    }
    setImporting(false);
    setShowImport(false);
    setImportRows([]);
    refreshUsers();
  };

  const handleCreateUser = async (formData: {
    full_name: string;
    email: string;
    password: string;
    role: string;
    modules: string[];
  }) => {
    const schoolId = await resolveSchoolId();
    if (!schoolId) {
      alert("Impossible de déterminer l'école. Rechargez la page.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email && formData.email.trim().toLowerCase() === user.email.toLowerCase()) {
      alert('Veuillez saisir une adresse email différente pour le nouveau membre');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/school/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId,
          fullName: formData.full_name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          modules: formData.modules,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Erreur lors de la création du membre.');
        return;
      }
      setShowCreate(false);
      await fetchUsers(schoolId);
    } catch {
      alert('Erreur réseau lors de la création du membre.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateModules = async (userId: string, modules: string[]) => {
    if (!school) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: school.id, userId, modules }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erreur lors de la mise à jour des permissions.');
        return;
      }
      setShowEdit(null);
      refreshUsers();
    } catch {
      alert('Erreur réseau lors de la mise à jour des permissions.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAccess = async (profileId: string, userId: string) => {
    if (!school) return;
    if (!confirm(`Révoquer l'accès de cet utilisateur ?`)) return;
    try {
      const res = await fetch(
        `/api/users?schoolId=${encodeURIComponent(school.id)}&userId=${encodeURIComponent(userId)}&profileId=${encodeURIComponent(profileId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erreur lors de la révocation.');
        return;
      }
      refreshUsers();
    } catch {
      alert('Erreur réseau lors de la révocation.');
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-500 text-sm">Chargement des utilisateurs...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="h-6 w-6" style={{ color: school?.primary_color || '#2563EB' }} />
            Utilisateurs & Permissions
          </h1>
          <p className="text-sm text-slate-500">
            {myRole === 'school_admin'
              ? `Gérer les accès du personnel de ${school?.name}`
              : `Gérer les permissions du personnel de ${school?.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> Canevas
          </button>
          <label className="px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer">
            <Upload className="h-3.5 w-3.5" /> Importer
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileImport} />
          </label>
          <button
            onClick={handleExport}
            className="px-3 py-2 text-xs font-semibold text-white rounded-lg flex items-center gap-1.5"
            style={{ backgroundColor: school?.primary_color || '#2563EB' }}
          >
            <Download className="h-3.5 w-3.5" /> Exporter
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"
          >
            <UserPlus className="h-3.5 w-3.5" /> + Ajouter un membre
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un membre..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">Tous les rôles</option>
            {ROLE_OPTIONS.filter((r) => canDelegateTo(myRole, r.value)).map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>
        <span className="text-xs text-slate-400">{filtered.length} membre(s)</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Nom</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Rôle</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Modules autorisés</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400 text-sm">
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.profile_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: school?.primary_color || '#2563EB' }}>
                          {u.full_name.split(' ').map((n) => n.charAt(0)).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{u.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${ROLE_COLORS[u.role] || 'bg-slate-100 text-slate-600'}`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.modules.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">Aucun module</span>
                        ) : (
                          u.modules.map((m) => {
                            const mod = ALL_MODULES.find((am) => am.id === m);
                            return (
                              <span key={m} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                {mod?.label || m}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEditUser(myRole, u.role) && (
                          <button
                            onClick={() => setShowEdit(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Modifier les permissions"
                          >
                            <Shield className="h-4 w-4" />
                          </button>
                        )}
                        {canEditUser(myRole, u.role) && u.role !== 'director' && (
                          <button
                            onClick={() => handleRevokeAccess(u.profile_id, u.user_id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Révoquer l'accès"
                          >
                            <ShieldOff className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateUserModal
          primaryColor={school?.primary_color || '#2563EB'}
          saving={saving}
          getAvailableModules={getAvailableModules}
          onSubmit={handleCreateUser}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showEdit && (
        <EditPermissionsModal
          user={showEdit}
          primaryColor={school?.primary_color || '#2563EB'}
          saving={saving}
          availableModules={getAvailableModules(showEdit.role)}
          onSubmit={(modules) => handleUpdateModules(showEdit.user_id, modules)}
          onClose={() => setShowEdit(null)}
        />
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Aperçu de l&apos;import</h3>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold">Nom</th>
                  <th className="px-3 py-2 text-left font-semibold">Email</th>
                  <th className="px-3 py-2 text-left font-semibold">Rôle</th>
                  <th className="px-3 py-2 text-left font-semibold">Statut</th>
                </tr></thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} className={`border-b border-slate-50 ${r.isValid ? '' : 'bg-rose-50'}`}>
                      <td className="px-3 py-2">{r.full_name}</td>
                      <td className="px-3 py-2">{r.email}</td>
                      <td className="px-3 py-2">{r.role}</td>
                      <td className="px-3 py-2">
                        {r.isValid ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <span className="text-rose-500 text-[10px]">{r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Annuler</button>
              <button
                onClick={handleConfirmImport}
                disabled={importing || importRows.filter((r) => r.isValid).length === 0}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {importing ? 'Import...' : `Importer ${importRows.filter((r) => r.isValid).length} ligne(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modale : Créer un utilisateur ──────────────────────────────────────────

function CreateUserModal({ primaryColor, saving, getAvailableModules, onSubmit, onClose }: {
  primaryColor: string;
  saving: boolean;
  getAvailableModules: (targetRole: string) => string[];
  onSubmit: (data: { full_name: string; email: string; password: string; role: string; modules: string[] }) => void;
  onClose: () => void;
}) {
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('teacher');
  const [modules, setModules] = useState<string[]>([]);

  // La modale est retirée du DOM à la fermeture ({showCreate && <CreateUserModal/>}),
  // donc les champs sont toujours vierges à la création (state initial).
  const availableModules = getAvailableModules(role);

  const toggleModule = (id: string) => {
    setModules((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
  };

  const visibleModules = ALL_MODULES.filter((m) => availableModules.includes(m.id));
  const modulesByPillar = PILLIERS.map((p) => ({
    ...p,
    items: visibleModules.filter((m) => p.modules.includes(m.id)),
  })).filter((p) => p.items.length > 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="h-5 w-5" style={{ color: primaryColor }} />
            Ajouter un membre
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nom complet</label>
            <input
              type="text"
              value={full_name}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Jean Dupont"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="jean.dupont@ecole.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Mot de passe provisoire</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="••••••••"
            />
            <p className="text-[10px] text-slate-400 mt-1">Le membre utilisera ce mot de passe pour se connecter.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Rôle</label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setModules([]);
              }}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Accès aux modules (par pilier)</label>
            {modulesByPillar.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">Aucun module disponible pour ce rôle.</p>
            ) : (
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {modulesByPillar.map((pillar) => (
                  <div key={pillar.id}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs">{pillar.icon}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pillar.label.split(' ')[0]}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {pillar.items.map((m) => (
                        <label key={m.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition ${modules.includes(m.id) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input type="checkbox" checked={modules.includes(m.id)} onChange={() => toggleModule(m.id)} className="rounded border-slate-300" />
                          <span className="text-xs font-medium">{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Annuler</button>
          <button
            onClick={() => onSubmit({ full_name, email, password, role, modules })}
            disabled={saving || !full_name || !email || !password}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? 'Création...' : 'Créer le compte'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modale : Éditer les permissions ────────────────────────────────────────

function EditPermissionsModal({ user, primaryColor, saving, availableModules, onSubmit, onClose }: {
  user: UserRow;
  primaryColor: string;
  saving: boolean;
  availableModules: string[];
  onSubmit: (modules: string[]) => void;
  onClose: () => void;
}) {
  const [modules, setModules] = useState<string[]>(
    user.modules.filter((m) => availableModules.includes(m)),
  );

  const toggleModule = (id: string) => {
    setModules((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
  };

  const visibleModules = ALL_MODULES.filter((m) => availableModules.includes(m.id));
  const lockedModules = user.modules.filter((m) => !availableModules.includes(m));

  const modulesByPillar = PILLIERS.map((p) => ({
    ...p,
    items: visibleModules.filter((m) => p.modules.includes(m.id)),
  })).filter((p) => p.items.length > 0);

  const lockedByPillar = PILLIERS.map((p) => ({
    ...p,
    items: lockedModules.filter((m) => p.modules.includes(m)),
  })).filter((p) => p.items.length > 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Shield className="h-5 w-5" style={{ color: primaryColor }} />
              Permissions
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{user.full_name} · {ROLE_LABELS[user.role]}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-80 overflow-y-auto pr-1">
          {modulesByPillar.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">Aucun module disponible pour déléguer à ce rôle.</p>
          ) : (
            <div className="space-y-4">
              {modulesByPillar.map((pillar) => (
                <div key={pillar.id}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs">{pillar.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pillar.label.split(' ')[0]}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {pillar.items.map((m) => (
                      <label key={m.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm cursor-pointer transition ${modules.includes(m.id) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={modules.includes(m.id)} onChange={() => toggleModule(m.id)} className="rounded border-slate-300" />
                        <span className="text-xs font-medium">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {lockedByPillar.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Lock className="h-3 w-3" /> Modules hérités (non modifiables)
              </p>
              <div className="space-y-2">
                {lockedByPillar.map((pillar) => (
                  <div key={pillar.id}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px]">{pillar.icon}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-300">{pillar.label.split(' ')[0]}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pillar.items.map((m) => {
                        const mod = ALL_MODULES.find((am) => am.id === m);
                        return (
                          <span key={m} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
                            {mod?.label || m}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Annuler</button>
          <button
            onClick={() => onSubmit([...modules, ...lockedModules])}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}