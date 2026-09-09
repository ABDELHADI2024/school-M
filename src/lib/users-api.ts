import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isPlatformOwnerEmail } from '@/lib/platform-owner';
import { devLog } from '@/lib/logger';

/** Client Supabase avec la clé service_role (contourne la RLS). */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabase(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function missingServiceKeyMessage() {
  return 'SUPABASE_SERVICE_ROLE_KEY manquante : ajoutez-la dans .env.local';
}

export interface ManagerProfile {
  role: string;
  school_id: string | null;
}

export type AuthResult =
  | { ok: true; user: { id: string; email?: string | null }; profile: ManagerProfile | null }
  | { ok: false; error: string; status: number };

/**
 * Autorise exclusivement un super administrateur de la plateforme
 * (profil `super_admin` ou email propriétaire de la plateforme).
 * Utilisé par les routes API /api/super-admin/* — dans tous les cas,
 * les autres rôles sont rejetés en 403.
 */
export async function authorizeSuperAdmin(): Promise<AuthResult> {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: 'Non authentifié', status: 401 };
  }

  // Profil : user_id == user.id (fallback admin serveur si RLS).
  let profile: ManagerProfile | null = null;

  const attempt = await supabase
    .from('user_profiles')
    .select('role, school_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (attempt.error) {
    const admin = getAdminClient();
    if (admin) {
      const adminAttempt = await admin
        .from('user_profiles')
        .select('role, school_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!adminAttempt.error) {
        profile = adminAttempt.data as ManagerProfile | null;
      }
    }
  } else {
    profile = attempt.data as ManagerProfile | null;
  }

  const isOwner = isPlatformOwnerEmail(user.email);
  if (profile?.role === 'super_admin' || isOwner) {
    return { ok: true as const, user, profile };
  }

  devLog('[SUPER ADMIN REFUS]', {
    callerId: user.id,
    callerRole: profile?.role ?? null,
  });
  return { ok: false as const, error: 'Accès réservé au super administrateur', status: 403 };
}

/**
 * Autorise un gestionnaire du dashboard école.
 *
 * Matrice d'autorisation :
 *  - profile.role === 'super_admin'             → accès total (toutes les écoles)
 *  - profile.role === 'school_admin' (ou 'owner') → accès total
 *  - profile.role === 'director'                → accès si profile.school_id === schoolId
 *  - email propriétaire de la plateforme          → accès total (traité comme super_admin)
 *
 * La requête `user_profiles` s'effectue d'abord avec la session (RLS) ; si elle échoue
 * à cause de la RLS, on retombe sur le client admin serveur (SUPABASE_SERVICE_ROLE_KEY)
 * pour vérifier le profil de manière fiable.
 */
export async function authorizeManagerForSchool(schoolId?: string): Promise<AuthResult> {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: 'Non authentifié', status: 401 };
  }

  // Profil du gestionnaire : user_id == user.id (fallback admin serveur si RLS).
  let profile: ManagerProfile | null = null;
  let fallback = false;

  const attempt = await supabase
    .from('user_profiles')
    .select('role, school_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (attempt.error) {
    const admin = getAdminClient();
    if (admin) {
      const adminAttempt = await admin
        .from('user_profiles')
        .select('role, school_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!adminAttempt.error) {
        profile = adminAttempt.data as ManagerProfile | null;
        fallback = true;
      }
    }
  } else {
    profile = attempt.data as ManagerProfile | null;
  }

  devLog('[AUTH CHECK]', {
    callerId: user.id,
    callerRole: profile?.role ?? null,
    callerSchoolId: profile?.school_id ?? null,
    targetSchoolId: schoolId,
    viaServiceRole: fallback,
  });

  const isPlatformOwner = isPlatformOwnerEmail(user.email);
  const callerRole = profile?.role ?? '';

  // Seuls le Super Admin et le propriétaire explicite de la plateforme sont
  // transverses. Le Owner d'une école reste strictement limité à son école.
  if (callerRole === 'super_admin' || isPlatformOwner) {
    return { ok: true as const, user, profile };
  }

  // Tous les gestionnaires d'école sont restreints à leur propre école.
  if (
    ['school_admin', 'owner', 'director'].includes(callerRole) &&
    (schoolId === undefined || profile?.school_id === schoolId)
  ) {
    return { ok: true as const, user, profile };
  }

  if (['school_admin', 'owner', 'director'].includes(callerRole)) {
    return { ok: false as const, error: 'Accès refusé', status: 403 };
  }

  if (!profile) {
    return { ok: false as const, error: 'Profil utilisateur introuvable', status: 403 };
  }

  return { ok: false as const, error: 'Rôle non autorisé', status: 403 };
}