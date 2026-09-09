import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient, authorizeManagerForSchool, missingServiceKeyMessage } from '@/lib/users-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/school/modules?schoolId=xxx
 * Renvoie la liste des identifiants des modules actifs de l'école
 * (table school_modules / is_enabled = true) via le client admin,
 * ce qui garantit le chargement de la sidebar et de la matrice de droits.
 */
export async function GET(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  }

  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  const { data: school } = await admin
    .from('schools')
    .select('id')
    .eq('id', schoolId)
    .maybeSingle();
  if (!school) {
    return NextResponse.json({ error: 'École introuvable' }, { status: 404 });
  }

  const { data: mods } = await admin
    .from('school_modules')
    .select('module_id')
    .eq('school_id', schoolId)
    .eq('is_enabled', true);

  // Carte id (UUID) → nom court ('students', 'grades', …) pour rester cohérent
  // avec les catalogues applicatifs (ALL_MODULES, user_modules).
  const { data: catalog } = await admin.from('modules').select('id, name');
  const idToName = new Map((catalog || []).map((m: { id: string; name: string }) => [m.id, m.name]));

  return NextResponse.json({
    modules: (mods || []).map((m: { module_id: string }) => idToName.get(m.module_id) ?? m.module_id),
  });
}