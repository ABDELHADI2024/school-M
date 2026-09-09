'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { School, sidebarModules } from '@/types';
import {
  Users, CalendarCheck, GraduationCap, Clock, CreditCard,
  Bus, UtensilsCrossed, Smartphone, Home, LogOut, Shield, ShieldCheck, Wallet, Megaphone,
  Bell, School as SchoolIcon,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  school_admin: 'Propriétaire',
  director: 'Directeur',
  staff: 'Personnel',
  teacher: 'Enseignant',
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  super_admin: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  school_admin: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  director: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  staff: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  teacher: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

/**
 * Les 6 Piliers du dashboard école, avec leurs modules.
 * L'affichage est piloté par module actif (school_modules) pour owner / school_admin.
 */
const PILLARS: {
  id: string;
  label: string;
  icon: string;
  items: { label: string; href: (slug: string) => string; icon: React.ComponentType<{ className?: string }>; module: string }[];
}[] = [
  {
    id: 'pedagogie',
    label: 'Pédagogie',
    icon: '🎓',
    items: [
      { label: 'Inscriptions', href: (s) => `/${s}/dashboard/students`, icon: Users, module: 'students' },
      { label: 'Classes', href: (s) => `/${s}/dashboard/classes`, icon: SchoolIcon, module: 'classes' },
      { label: 'Notes & Bulletins', href: (s) => `/${s}/dashboard/grades`, icon: GraduationCap, module: 'grades' },
    ],
  },
  {
    id: 'finances',
    label: 'Finances',
    icon: '💳',
    items: [
      { label: 'Facturation & Caisse', href: (s) => `/${s}/dashboard/finance`, icon: CreditCard, module: 'finance' },
      { label: 'Grilles tarifaires', href: (s) => `/${s}/dashboard/finance/tarifs`, icon: Wallet, module: 'finance' },
    ],
  },
  {
    id: 'rh',
    label: 'RH & Accès',
    icon: '👥',
    items: [
      { label: 'Personnel & Rôles', href: (s) => `/${s}/dashboard/users`, icon: Shield, module: 'users' },
    ],
  },
  {
    id: 'vie_scolaire',
    label: 'Vie Scolaire',
    icon: '⏰',
    items: [
      { label: 'Émargement', href: (s) => `/${s}/dashboard/attendance`, icon: CalendarCheck, module: 'attendance' },
      { label: 'Emploi du temps', href: (s) => `/${s}/dashboard/timetable`, icon: Clock, module: 'timetable' },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    icon: '🚌',
    items: [
      { label: 'Cantine', href: (s) => `/${s}/dashboard/services/canteen`, icon: UtensilsCrossed, module: 'canteen' },
      { label: 'Transport', href: (s) => `/${s}/dashboard/services/transport`, icon: Bus, module: 'transport' },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: '📱',
    items: [
      { label: 'Annonces', href: (s) => `/${s}/dashboard/communication`, icon: Megaphone, module: 'communication' },
      { label: 'Notifications', href: (s) => `/${s}/dashboard/communication/notifications`, icon: Bell, module: 'communication' },
      { label: 'Portail Parents', href: (s) => `/${s}/parent`, icon: Smartphone, module: 'portal' },
    ],
  },
];

interface UserProfile {
  role: string;
  full_name: string | null;
}

export default function SchoolDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ schoolSlug: string }>;
}) {
  const resolvedParams = use(params);
  const schoolSlug = resolvedParams.schoolSlug;
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [school, setSchool] = useState<School | null>(null);
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userModules, setUserModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const { data: schoolData } = await supabase
        .from('schools')
        .select('*')
        .eq('slug', schoolSlug)
        .single();

      if (schoolData) {
        setSchool(schoolData);

        // Rôle : 1 seul profil par utilisateur (user_profiles.user_id UNIQUE),
        // on le récupère sans filtrer par école pour ne pas le rater.
        let currentRole = '';
        if (user) {
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('role, school_id, full_name')
            .eq('user_id', user.id)
            .maybeSingle();
          currentRole = profileData?.role ?? '';
          if (currentRole) {
            setUserProfile({ role: currentRole, full_name: profileData?.full_name ?? null });
          }
        }

        // Garde-fou : un parent ne doit jamais voir le dashboard école.
        if (currentRole === 'parent') {
          router.replace(`/${schoolSlug}/parent`);
          return;
        }

        if (currentRole === 'super_admin') {
          setIsSuperAdmin(true);
        }

        const [userModsResult, activeModulesResult] = await Promise.all([
          user
            ? supabase.from('user_modules').select('module_id').eq('user_id', user.id).eq('school_id', schoolData.id)
            : Promise.resolve({ data: null as { module_id: string }[] | null }),
          (async () => {
            // Modules actifs chargés via le client admin du serveur
            // (contourne la RLS et garantit l'affichage des 6 Piliers).
            try {
              const modulesRes = await fetch(
                `/api/school/modules?schoolId=${encodeURIComponent(schoolData.id)}`,
                { cache: 'no-store' }
              );
              if (!modulesRes.ok) return [] as string[];
              const payload = await modulesRes.json().catch(() => ({ modules: [] as string[] }));
              return (payload.modules || []) as string[];
            } catch {
              return [] as string[];
            }
          })(),
        ]);

        setActiveModules(activeModulesResult);
        if (userModsResult.data) {
          setUserModules(userModsResult.data.map((m: { module_id: string }) => m.module_id));
        }
      }
      setLoading(false);
    }
    loadData();
  }, [schoolSlug, supabase, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Chargement de l&apos;espace école...
      </div>
    );
  }

  const currentRole = userProfile?.role || '';
  // owner / school_admin / super_admin : accès complet → TOUJOURS l'intégralité
  // des modules (sans exiger d'entrée dans user_modules).
  const isFullAccess = currentRole === 'school_admin' || currentRole === 'super_admin';
  const visibleModules = sidebarModules(currentRole, activeModules, userModules);
  const homeHref = `/${schoolSlug}/dashboard`;
  const canSeeItem = (module: string) => isFullAccess || visibleModules.includes(module);

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-5 border-b border-slate-800 flex items-center gap-3">
            {school?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.logo_url} alt={school.name} className="h-10 w-auto max-w-[120px] object-contain" />
            ) : (
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0"
                style={{ backgroundColor: school?.primary_color || '#2563eb' }}
              >
                {school?.name.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div className="overflow-hidden">
              <h2 className="font-bold text-white text-sm truncate">{school?.name}</h2>
              <span className="text-[11px] text-slate-500 block font-medium">Année 2026-2027</span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            <Link
              href={homeHref}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                pathname === homeHref
                  ? 'bg-indigo-600/15 text-white ring-1 ring-indigo-500/40'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Home className={`h-4 w-4 ${pathname === homeHref ? 'text-indigo-300' : 'text-slate-500'}`} />
              Accueil
            </Link>

            {PILLARS.map((pillar) => {
              const items = pillar.items.filter((i) => canSeeItem(i.module));
              if (items.length === 0) return null;
              return (
                <div key={pillar.id} className="pt-4 mt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2 px-3 mb-1.5">
                    <span className="text-xs">{pillar.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {pillar.label}
                    </span>
                  </div>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const href = item.href(schoolSlug);
                    const isActive = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                          isActive
                            ? 'bg-indigo-600/15 text-white ring-1 ring-indigo-500/40'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-300' : 'text-slate-500'}`} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 space-y-3">
          {isSuperAdmin && (
            <Link
              href="/super-admin"
              className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 font-semibold transition"
            >
              <ShieldCheck className="h-4 w-4" />
              Retour Super Admin
            </Link>
          )}
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 font-medium transition"
          >
            <Home className="h-4 w-4" />
            Accueil
          </Link>
          <form action="/logout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 font-medium transition"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-slate-100 truncate">{school?.name}</span>
            <span className="text-slate-600">/</span>
            <span className="text-sm text-slate-400">Dashboard</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {currentRole && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${ROLE_BADGE_COLORS[currentRole] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'}`}>
                {isSuperAdmin ? (
                  <>
                    <ShieldCheck className="h-3 w-3" />
                    Mode Supervision Super Admin
                  </>
                ) : currentRole === 'school_admin' || currentRole === 'director' ? (
                  <>
                    <ShieldCheck className="h-3 w-3" />
                    Direction Générale
                  </>
                ) : (
                  ROLE_LABELS[currentRole] || currentRole
                )}
              </span>
            )}

            {!isSuperAdmin && userProfile?.full_name && (
              <span className="hidden max-w-[220px] truncate text-sm font-semibold text-slate-200 sm:inline">
                {userProfile.full_name}
              </span>
            )}

            {isSuperAdmin && (
              <Link
                href="/super-admin"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-300 bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20 transition-colors"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Super Admin
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
