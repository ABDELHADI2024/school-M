import { createClient } from '@/lib/supabase/server';
import {
  School,
  Users,
  Layers,
  CheckCircle2,
  PauseCircle,
  ArrowRight,
  Clock,
  GraduationCap,
  UserPlus,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

export default async function SuperAdminDashboard() {
  const supabase = await createClient();

  const [
    { count: schoolsCount },
    { count: activeCount },
    { count: suspendedCount },
    { count: studentsCount },
    { count: usersCount },
    { count: licencesCount },
  ] = await Promise.all([
    supabase.from('schools').select('*', { count: 'exact', head: true }),
    supabase.from('schools').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('schools').select('*', { count: 'exact', head: true }).eq('is_active', false),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('school_modules').select('*', { count: 'exact', head: true }).eq('is_enabled', true),
  ]);

  const { data: recentSchools } = await supabase
    .from('schools')
    .select('id, name, slug, logo_url, primary_color, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: recentUsers } = await supabase
    .from('user_profiles')
    .select('user_id, full_name, role, school_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: recentModules } = await supabase
    .from('school_modules')
    .select('school_id, module_id, is_enabled, created_at')
    .order('created_at', { ascending: false })
    .limit(8);

  const { data: recentAuditLogs } = await supabase
    .from('audit_logs')
    .select('id, action, entity_id, metadata, created_at')
    .eq('entity_type', 'school')
    .order('created_at', { ascending: false })
    .limit(8);

  const { data: allSchools } = await supabase
    .from('schools')
    .select('id, name, slug');

  const schoolMap: Record<string, { name: string; slug: string }> = {};
  (allSchools || []).forEach((s) => {
    schoolMap[s.id] = { name: s.name, slug: s.slug };
  });

  const stats = [
    { label: 'Écoles', value: schoolsCount ?? 0, icon: School, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { label: 'Actives', value: activeCount ?? 0, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Suspendues', value: suspendedCount ?? 0, icon: PauseCircle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
    { label: 'Élèves', value: studentsCount ?? 0, icon: Users, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Utilisateurs', value: usersCount ?? 0, icon: UserPlus, color: 'text-sky-400', bg: 'bg-sky-500/10' },
    { label: 'Licences', value: licencesCount ?? 0, icon: Layers, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  ];

  type ActivityItem = {
    id: string;
    icon: typeof School;
    color: string;
    bg: string;
    text: string;
    detail: string;
    timestamp: string | null;
  };

  const activityItems: ActivityItem[] = [];

  (recentSchools || []).forEach((school) => {
    activityItems.push({
      id: `school-${school.id}`,
      icon: School,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      text: `École « ${school.name} » créée`,
      detail: `/${school.slug}`,
      timestamp: school.created_at,
    });
  });

  (recentUsers || []).forEach((user) => {
    const roleLabel = user.role === 'school_admin' ? 'Propriétaire' : user.role === 'director' ? 'Directeur' : user.role === 'teacher' ? 'Enseignant' : user.role;
    activityItems.push({
      id: `user-${user.user_id}`,
      icon: UserPlus,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
      text: `${user.full_name || 'Utilisateur'} — ${roleLabel}`,
      detail: user.school_id ? schoolMap[user.school_id]?.name || 'École' : 'Plateforme',
      timestamp: user.created_at,
    });
  });

  (recentModules || []).forEach((mod, i) => {
    const schoolName = schoolMap[mod.school_id]?.name || 'École';
    activityItems.push({
      id: `module-${mod.school_id}-${mod.module_id}-${i}`,
      icon: mod.is_enabled ? CheckCircle2 : PauseCircle,
      color: mod.is_enabled ? 'text-emerald-400' : 'text-rose-400',
      bg: mod.is_enabled ? 'bg-emerald-500/10' : 'bg-rose-500/10',
      text: `Module ${mod.module_id} ${mod.is_enabled ? 'activé' : 'désactivé'}`,
      detail: schoolName,
      timestamp: mod.created_at,
    });
  });

  (recentAuditLogs || []).forEach((log) => {
    const metadata = log.metadata as { name?: string; slug?: string } | null;
    const actionLabels: Record<string, string> = {
      'school.created': 'Établissement créé',
      'school.updated': 'Établissement modifié',
      'school.deleted': 'Établissement supprimé',
      'school.status_changed': 'Statut établissement modifié',
      'school.modules_updated': 'Modules établissement modifiés',
    };
    activityItems.push({
      id: `audit-${log.id}`,
      icon: ShieldCheck,
      color: log.action === 'school.deleted' ? 'text-rose-400' : 'text-violet-400',
      bg: log.action === 'school.deleted' ? 'bg-rose-500/10' : 'bg-violet-500/10',
      text: actionLabels[log.action] || 'Action administrateur',
      detail: metadata?.name || metadata?.slug || log.entity_id,
      timestamp: log.created_at,
    });
  });

  activityItems.sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const recentActivity = activityItems.slice(0, 10);

  function formatRelativeTime(ts: string | null): string {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="relative mx-auto max-w-6xl space-y-8">
      <div className="pointer-events-none absolute -top-32 right-10 h-72 w-72 rounded-full bg-indigo-600/[0.08] blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.9)]" />
            Système opérationnel
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Tableau de bord</h2>
          <p className="mt-2 text-sm text-slate-400">Vue d&apos;ensemble de la plateforme SaaS multi-tenant</p>
        </div>
        <Link
          href="/super-admin/schools"
          className="group inline-flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-2.5 text-sm font-semibold text-indigo-200 transition hover:border-indigo-300/40 hover:bg-indigo-500/20"
        >
          Gérer les établissements
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/50 p-5 shadow-2xl shadow-indigo-950/20 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14]"
            >
              <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-indigo-500/[0.06] blur-2xl transition group-hover:bg-indigo-400/10" />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">{stat.label}</p>
                  <p className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{stat.value}</p>
                  <p className="mt-2 text-[11px] text-slate-500">Données en temps réel</p>
                </div>
                <div className={`${stat.bg} rounded-2xl border border-white/[0.08] p-3.5 shadow-lg`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/50 p-6 shadow-2xl shadow-indigo-950/20 backdrop-blur-xl lg:col-span-3">
          <div className="absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-cyan-500/[0.05] blur-3xl" />
          <div className="relative space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-2.5 shadow-lg shadow-indigo-950/20">
                <Activity className="h-4 w-4 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Activité récente</h3>
                <p className="text-xs text-slate-500">Dernières actions sur la plateforme</p>
              </div>
            </div>
          </div>

          {recentActivity.length > 0 ? (
            <ul className="space-y-1">
              {recentActivity.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
                    <div className={`${item.bg} p-1.5 rounded-lg shrink-0`}>
                      <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-200 truncate">{item.text}</p>
                      <p className="text-[11px] text-slate-500 truncate">{item.detail}</p>
                    </div>
                    {item.timestamp && (
                      <span className="text-[11px] text-slate-600 shrink-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(item.timestamp)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 py-4 text-center">Aucune activité récente.</p>
          )}
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/50 p-6 shadow-2xl shadow-indigo-950/20 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Établissements récents</h3>
                <p className="text-xs text-slate-400">Les 5 dernières créations</p>
              </div>
              <Link
                href="/super-admin/schools"
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Tout voir
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {recentSchools && recentSchools.length > 0 ? (
              <ul className="space-y-2.5">
                {recentSchools.map((school) => (
                  <li key={school.id} className="flex items-center gap-3 py-2">
                    {school.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={school.logo_url}
                        alt={school.name}
                        className="h-8 w-8 object-contain rounded-lg border border-slate-700 p-0.5 bg-slate-800"
                      />
                    ) : (
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
                        style={{ backgroundColor: school.primary_color || '#2563eb' }}
                      >
                        {school.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-100 text-sm truncate">{school.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">/{school.slug}</p>
                    </div>
                    {school.is_active ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded shrink-0">
                        Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded shrink-0">
                        Suspendue
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Aucun établissement pour le moment.</p>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.05] p-5 shadow-2xl shadow-emerald-950/10 backdrop-blur-xl">
            <div className="shrink-0 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-2.5">
              <GraduationCap className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-white text-sm">Direction & Pilotage</h3>
              <p className="text-xs text-slate-400">
                Tableau de bord décisionnel — auto-inclus pour chaque école.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/super-admin/schools"
              className="group rounded-2xl border border-white/[0.08] bg-slate-900/50 p-4 text-center shadow-xl shadow-indigo-950/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-indigo-500/40"
            >
              <School className="h-5 w-5 text-indigo-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">Écoles</p>
            </Link>
            <Link
              href="/super-admin/modules"
              className="group rounded-2xl border border-white/[0.08] bg-slate-900/50 p-4 text-center shadow-xl shadow-indigo-950/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-indigo-500/40"
            >
              <Layers className="h-5 w-5 text-indigo-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">Modules</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
