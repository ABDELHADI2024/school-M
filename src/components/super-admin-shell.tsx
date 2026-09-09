'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { School, Layers, ShieldCheck, BarChart3, LogOut, Sparkles } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/super-admin', label: 'Tableau de bord', icon: BarChart3 },
  { href: '/super-admin/schools', label: 'Écoles & Clients', icon: School },
  { href: '/super-admin/modules', label: 'Catalogue Modules', icon: Layers },
];

export function SuperAdminShell({
  name,
  email,
}: {
  name: string | null;
  email: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }, [supabase, router]);

  const displayName = name || 'Admin';
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside className="relative w-72 bg-slate-950 text-slate-300 flex flex-col justify-between h-screen shrink-0 p-4 border-r border-white/[0.08] overflow-hidden">
      <div className="absolute -top-32 -left-24 h-72 w-72 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-24 -right-32 h-64 w-64 rounded-full bg-cyan-500/[0.06] blur-3xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-3 px-3 py-4 mb-7">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-xl shadow-indigo-950/50">
            <div className="absolute inset-0 rounded-2xl bg-indigo-400/30 blur-md" />
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-indigo-400 via-violet-300 to-cyan-300 bg-clip-text text-lg font-bold leading-tight text-transparent">
              Super Admin
            </h1>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Control center
            </p>
          </div>
        </div>

        <div className="px-3 mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
          <Sparkles className="h-3 w-3 text-indigo-400" />
          Navigation
        </div>
        <nav className="space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/super-admin'
              ? pathname === '/super-admin'
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'border-indigo-500/20 bg-indigo-600/15 text-indigo-200 shadow-lg shadow-indigo-950/20'
                    : 'border-transparent text-slate-400 hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 transition-colors ${isActive ? 'text-indigo-300' : 'text-slate-500 group-hover:text-indigo-300'}`} />
                {item.label}
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3 shadow-2xl shadow-indigo-950/20">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          Master admin
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-indigo-500/20 text-sm font-bold text-violet-200 ring-1 ring-violet-400/20">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{displayName}</p>
              {email && <p className="truncate text-[11px] text-slate-500">{email}</p>}
            </div>
          </div>
          {confirmSignOut ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setConfirmSignOut(false)}
                className="rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                Annuler
              </button>
              <button
                onClick={handleSignOut}
                className="rounded-lg bg-rose-500/15 px-2 py-1.5 text-[10px] font-semibold text-rose-300 transition hover:bg-rose-500/25"
              >
                Quitter
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmSignOut(true)}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
              aria-label="Déconnexion"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
