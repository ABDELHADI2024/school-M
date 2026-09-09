import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isPlatformOwnerEmail } from '@/lib/platform-owner';
import { devLog } from '@/lib/logger';
import { SuperAdminShell } from '@/components/super-admin-shell';

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, school_id')
    .eq('user_id', user.id)
    .single();

  const role = profile?.role ?? null;
  // Propriétaire de la plateforme : SUPER_ADMIN_OVERRIDE_EMAIL ou fallback galaxprap@gmail.com.
  const isOwner = isPlatformOwnerEmail(user.email);

  // Accès PRIORITAIRE : rôle super_admin ou email propriétaire — jamais bloqué,
  // y compris lorsque school_id est null (pas de redirection vers un dashboard école).
  const canAccess = isOwner || role === 'super_admin';

  if (!canAccess) {
    // Autres rôles : renvoyer vers leur espace école (s'il en a un), sinon l'accueil.
    if (profile?.school_id) {
      const { data: school } = await supabase
        .from('schools')
        .select('slug')
        .eq('id', profile.school_id)
        .single();
      if (school?.slug) {
        devLog(`[super-admin/layout] user=${user.email} role=${role} → /${school.slug}/dashboard`);
        redirect(`/${school.slug}/dashboard`);
      }
    }
    redirect('/');
  }

  devLog(`[super-admin/layout] user=${user.email} role=${role}`);

  return (
    <div className="h-screen flex overflow-hidden bg-slate-950 text-slate-100">
      <SuperAdminShell name={profile?.full_name ?? null} email={user.email ?? null} />
      <main className="flex-1 min-w-0 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}