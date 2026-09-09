import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient, authorizeManagerForSchool, missingServiceKeyMessage } from '@/lib/users-api';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['director', 'staff', 'teacher'];

/** Récupère tous les emails des users auth (jointure avec auth.users). */
async function buildEmailMap(admin: NonNullable<ReturnType<typeof getAdminClient>>) {
  const emailMap: Record<string, string> = {};
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    (data.users || []).forEach((u: { id?: string; email?: string | null }) => {
      if (u.id) emailMap[u.id] = u.email || '';
    });
    hasMore = Boolean(data.nextPage);
    page += 1;
  }

  return emailMap;
}

/**
 * GET /api/school/users?schoolId=...
 * Liste complète des membres de l'école (profil + email via auth.users + permissions
 * modules + date de création). Auth gérée côté serveur avec authorizeManagerForSchool.
 */
export async function GET(request: NextRequest) {
  const requestedSchoolId = request.nextUrl.searchParams.get('schoolId');
  if (!requestedSchoolId) {
    return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  }

  const auth = await authorizeManagerForSchool(requestedSchoolId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  const [{ data: profiles }, { data: modules }] = await Promise.all([
    admin.from('user_profiles').select('*').eq('school_id', requestedSchoolId),
    admin.from('user_modules').select('*').eq('school_id', requestedSchoolId),
  ]);

  const emailMap = await buildEmailMap(admin);

  const moduleMap: Record<string, string[]> = {};
  (modules || []).forEach((m: { user_id: string; module_id: string }) => {
    const uid = m.user_id;
    if (!moduleMap[uid]) moduleMap[uid] = [];
    moduleMap[uid].push(m.module_id);
  });

  const users = (profiles || []).map((p: {
    id: string;
    user_id: string;
    full_name: string | null;
    role: string;
    created_at?: string | null;
  }) => ({
    profileId: p.id,
    userId: p.user_id,
    fullName: p.full_name || '—',
    email: emailMap[p.user_id] ?? null,
    role: p.role,
    modules: moduleMap[p.user_id] || [],
    isActive: true,
    createdAt: p.created_at ?? null,
  }));

  return NextResponse.json({ users });
}

/**
 * POST /api/school/users
 * Création d'un membre de l'école :
 *   1. vérifie la session + rôle (via le client serveur basé sur cookies() de next/headers)
 *   2. détermine l'école ciblée : schoolId du body, sinon school_id du profil connecté
 *   3. crée le compte dans Supabase Auth (email_confirm: true)
 *   4. insère la ligne dans public.user_profiles
 *   5. insère les droits cochés dans public.user_modules
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const requestedSchoolId = String(body.schoolId || '').trim();
  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  const role = String(body.role || '');
  const modules: string[] = Array.isArray(body.modules) ? body.modules.map(String) : [];

  if (!fullName || !email || !password || !role) {
    return NextResponse.json({ error: 'Tous les champs sont obligatoires' }, { status: 400 });
  }
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
  }

  // 1. Authentification + autorisation. Le client serveur lit la session dans les
  // cookies de la requête (createServerClient + cookies() de next/headers), donc
  // supabase.auth.getUser() reconnaît l'utilisateur connecté.
  const auth = await authorizeManagerForSchool(requestedSchoolId || undefined);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 2. École ciblée : schoolId explicite du body, sinon school_id du profil connecté.
  const schoolId = requestedSchoolId || auth.profile?.school_id || '';
  if (!schoolId) {
    return NextResponse.json({ error: 'École introuvable' }, { status: 404 });
  }

  const creatorRole = auth.profile?.role ?? '';
  const allowedRolesByCreator: Record<string, string[]> = {
    school_admin: ['director', 'staff'],
    owner: ['director', 'staff'],
    director: ['staff', 'teacher'],
  };

  // La création suit la pyramide : le Super Admin crée uniquement l'Owner
  // via l'endpoint écoles, et les gestionnaires ne créent que leur niveau inférieur.
  if (!allowedRolesByCreator[creatorRole]?.includes(role)) {
    return NextResponse.json(
      { error: 'Ce rôle ne peut pas créer ce type de compte' },
      { status: 403 }
    );
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  // L'école doit exister
  const { data: school } = await admin
    .from('schools')
    .select('id')
    .eq('id', schoolId)
    .maybeSingle();
  if (!school) {
    return NextResponse.json({ error: 'École introuvable' }, { status: 404 });
  }

  // 2. Création du compte dans Supabase Auth
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (!created?.user) {
    const isDuplicate = createError?.message?.toLowerCase().includes('already registered');
    return NextResponse.json(
      { error: createError?.message || 'Impossible de créer le compte' },
      { status: isDuplicate ? 409 : 500 }
    );
  }

  const userId = created.user.id;

  // 3. Insertion dans public.user_profiles
  const { error: profileError } = await admin.from('user_profiles').insert({
    user_id: userId,
    school_id: schoolId,
    role,
    full_name: fullName,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // 4. Attribution des permissions modules
  if (modules.length > 0) {
    const { error: modulesError } = await admin.from('user_modules').insert(
      modules.map((m) => ({ user_id: userId, school_id: schoolId, module_id: m }))
    );
    if (modulesError) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: modulesError.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    { user: { profileId: userId, userId, fullName, email, role, modules } },
    { status: 201 }
  );
}