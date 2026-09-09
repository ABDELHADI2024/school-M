import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient, authorizeManagerForSchool, missingServiceKeyMessage } from '@/lib/users-api';

export const dynamic = 'force-dynamic';

/** Récupère tous les emails des users auth (jointure avec auth.users). */
async function buildEmailMap() {
  const admin = getAdminClient();
  if (!admin) return null;

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

export async function GET(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  }

  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const emailMap = await buildEmailMap();
  if (!emailMap) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  const admin = getAdminClient()!;
  const [{ data: profiles }, { data: modules }] = await Promise.all([
    admin.from('user_profiles').select('*').eq('school_id', schoolId),
    admin.from('user_modules').select('*').eq('school_id', schoolId),
  ]);

  const moduleMap: Record<string, string[]> = {};
  (modules || []).forEach((m: { user_id: string; module_id: string }) => {
    const uid = m.user_id;
    if (!moduleMap[uid]) moduleMap[uid] = [];
    moduleMap[uid].push(m.module_id);
  });

  const users = (profiles || []).map((p: { id: string; user_id: string; full_name: string | null; role: string }) => ({
    profileId: p.id,
    userId: p.user_id,
    fullName: p.full_name || '—',
    email: emailMap[p.user_id] ?? null,
    role: p.role,
    modules: moduleMap[p.user_id] || [],
    isActive: true,
  }));

  return NextResponse.json({ users });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const schoolId = String(body.schoolId || '');
  const userId = String(body.userId || '');
  const modules: string[] = Array.isArray(body.modules) ? body.modules.map(String) : [];

  if (!schoolId || !userId) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
  }

  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  // Le membre ciblé doit bien dépendre de cette école
  const { data: target } = await admin
    .from('user_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: 'Membre introuvable pour cette école' }, { status: 404 });
  }

  await admin.from('user_modules').delete().eq('user_id', userId).eq('school_id', schoolId);
  if (modules.length > 0) {
    const { error: modsError } = await admin.from('user_modules').insert(
      modules.map((m) => ({ user_id: userId, school_id: schoolId, module_id: m }))
    );
    if (modsError) {
      return NextResponse.json({ error: modsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, modules });
}

export async function DELETE(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  const userId = request.nextUrl.searchParams.get('userId');
  const profileId = request.nextUrl.searchParams.get('profileId');

  if (!schoolId || !userId || !profileId) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
  }

  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  // Révoque les permissions puis supprime le profil
  await admin.from('user_modules').delete().eq('user_id', userId).eq('school_id', schoolId);
  const { error } = await admin.from('user_profiles').delete().eq('id', profileId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}