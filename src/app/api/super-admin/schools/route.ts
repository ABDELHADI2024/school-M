import { NextResponse, type NextRequest } from 'next/server';
import {
  getAdminClient,
  authorizeSuperAdmin,
  missingServiceKeyMessage,
} from '@/lib/users-api';
import {
  slugifyName,
  ensureUniqueSchoolSlug,
  activateDefaultModules,
  type AdminClient,
} from '@/lib/schools';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function buildEmailMap(admin: AdminClient) {
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
 * GET /api/super-admin/schools
 * Liste enrichie des écoles : modules actifs, effectif élèves et propriétaire
 * (nom + email via auth.users). Auth : super admin uniquement.
 */
export async function GET() {
  const auth = await authorizeSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  const { data: schools, error: schoolsError } = await admin
    .from('schools')
    .select('*')
    .order('created_at', { ascending: false });
  if (schoolsError) {
    return NextResponse.json({ error: schoolsError.message }, { status: 500 });
  }

  const [{ data: enabledLicenses }, { data: students }, { data: owners }] =
    await Promise.all([
      admin
        .from('school_modules')
        .select('school_id')
        .eq('is_enabled', true),
      admin.from('students').select('school_id'),
      admin
        .from('user_profiles')
        .select('user_id, school_id, full_name')
        .eq('role', 'school_admin'),
    ]);

  const moduleCounts: Record<string, number> = {};
  (enabledLicenses || []).forEach((row: { school_id: string }) => {
    moduleCounts[row.school_id] = (moduleCounts[row.school_id] || 0) + 1;
  });

  const studentCounts: Record<string, number> = {};
  (students || []).forEach((row: { school_id: string }) => {
    studentCounts[row.school_id] = (studentCounts[row.school_id] || 0) + 1;
  });

  const ownerBySchool: Record<string, { user_id: string; full_name: string | null }> = {};
  (owners || []).forEach((row: { user_id: string; school_id: string; full_name: string | null }) => {
    if (!ownerBySchool[row.school_id]) {
      ownerBySchool[row.school_id] = { user_id: row.user_id, full_name: row.full_name };
    }
  });

  const ownerIds = Object.keys(ownerBySchool).map((sid) => ownerBySchool[sid].user_id);
  const emailMap = ownerIds.length > 0 ? await buildEmailMap(admin) : {};

  const payload = (schools || []).map((school) => ({
    ...school,
    moduleCount: moduleCounts[school.id] || 0,
    studentsCount: studentCounts[school.id] || 0,
    ownerFullName: ownerBySchool[school.id]?.full_name ?? null,
    ownerEmail: ownerBySchool[school.id] ? emailMap[ownerBySchool[school.id].user_id] ?? null : null,
  }));

  return NextResponse.json({ schools: payload });
}

/**
 * POST /api/super-admin/schools
 * Création atomique d'un établissement :
 *   1. slug unique auto-généré (ou fourni)
 *   2. création dans public.schools
 *   3. activation des modules par défaut (is_core) dans public.school_modules
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const name = String(body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Le nom de l’école est obligatoire' }, { status: 400 });
  }

  const nestedAdmin = body.admin && typeof body.admin === 'object' ? body.admin : {};
  const finalEmail = String(
    nestedAdmin.email || body.adminEmail || body.directorEmail || body.admin_email || ''
  ).trim().toLowerCase();
  const finalPassword = String(
    nestedAdmin.password || body.adminPassword || body.directorPassword || body.admin_password || ''
  ).trim();
  const finalFirstName = String(
    nestedAdmin.firstName || body.adminFirstName || body.directorFirstName || body.admin_first_name || ''
  ).trim();
  const finalLastName = String(
    nestedAdmin.lastName || body.adminLastName || body.directorLastName || body.admin_last_name || ''
  ).trim();
  if (!finalFirstName || !finalLastName || !finalEmail || !finalPassword) {
    return NextResponse.json(
      { error: "Les informations de l'administrateur initial sont obligatoires" },
      { status: 400 }
    );
  }
  if (finalPassword.length < 10) {
    return NextResponse.json(
      { error: 'Le mot de passe initial doit contenir au moins 10 caractères' },
      { status: 400 }
    );
  }
  if (!/^\S+@\S+\.\S+$/.test(finalEmail)) {
    return NextResponse.json({ error: "L'email professionnel est invalide" }, { status: 400 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  const rawSlug = String(body.slug || '').trim();
  const requestedSlug = rawSlug ? slugifyName(rawSlug) : slugifyName(name);
  if (!requestedSlug) {
    return NextResponse.json({ error: 'Le slug de l’école est invalide' }, { status: 400 });
  }

  const { data: existingSlug } = await admin
    .from('schools')
    .select('id')
    .eq('slug', requestedSlug)
    .maybeSingle();
  if (existingSlug) {
    return NextResponse.json(
      { error: `Le slug « ${requestedSlug} » est déjà utilisé.` },
      { status: 409 }
    );
  }

  const slug = rawSlug ? requestedSlug : await ensureUniqueSchoolSlug(admin, requestedSlug);
  const currency = String(body.currency || 'MAD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ error: 'La devise doit être un code ISO à 3 lettres' }, { status: 400 });
  }

  const { data: school, error } = await admin
    .from('schools')
    .insert({
      name,
      slug,
      logo_url: body.logo_url ? String(body.logo_url) : null,
      primary_color: String(body.primary_color || '#2563eb'),
      secondary_color: String(body.secondary_color || '#1e40af'),
      phone: body.phone ? String(body.phone) : null,
      email: body.email ? String(body.email) : null,
      address: body.city ? String(body.city).trim() : body.address ? String(body.address) : null,
      city: body.city ? String(body.city).trim() : null,
      currency,
    })
    .select()
    .single();

  if (error || !school) {
    return NextResponse.json(
      { error: error?.message || 'Impossible de créer l’établissement' },
      { status: 500 }
    );
  }

  let moduleCount = 0;
  let initialUserId: string | null = null;
  try {
    const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
      email: finalEmail,
      password: finalPassword,
      email_confirm: true,
    });
    if (userError || !createdUser.user) {
      throw new Error(userError?.message || "Impossible de créer l'administrateur initial");
    }
    initialUserId = createdUser.user.id;

    const { error: profileError } = await admin.from('user_profiles').insert({
      user_id: initialUserId,
      full_name: `${finalFirstName} ${finalLastName}`,
      role: 'school_admin',
      school_id: school.id,
    });
    if (profileError) throw new Error(profileError.message);

    moduleCount = await activateDefaultModules(admin, school.id);
  } catch (err) {
    if (initialUserId) await admin.auth.admin.deleteUser(initialUserId);
    await admin.from('schools').delete().eq('id', school.id);
    return NextResponse.json(
      {
        error: err instanceof Error
          ? `Établissement non créé : ${err.message}`
          : 'Établissement non créé : activation des modules impossible',
      },
      { status: 500 }
    );
  }

  await writeAuditLog(admin, {
    actorUserId: auth.user.id,
    action: 'school.created',
    entityId: school.id,
    metadata: {
      name: school.name,
      slug: school.slug,
      moduleCount,
      initialAdminEmail: finalEmail,
      initialAdminUserId: initialUserId,
    },
  });

  return NextResponse.json(
    {
      school: {
        ...school,
        moduleCount,
        studentsCount: 0,
        ownerFullName: `${finalFirstName} ${finalLastName}`,
        ownerEmail: finalEmail,
      },
      initialAdmin: {
        fullName: `${finalFirstName} ${finalLastName}`,
        email: finalEmail,
        password: finalPassword,
        loginUrl: '/login',
      },
    },
    { status: 201 }
  );
}

/**
 * DELETE /api/super-admin/schools
 * Supprime un établissement de test (et ses modules associés).
 * Body: { schoolId: string }
 */
export async function DELETE(request: NextRequest) {
  const auth = await authorizeSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const schoolId = body?.schoolId ? String(body.schoolId).trim() : '';
  if (!schoolId) {
    return NextResponse.json({ error: "Identifiant d'école manquant" }, { status: 400 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  const { data: existing } = await admin
    .from('schools')
    .select('id, name')
    .eq('id', schoolId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Établissement introuvable' }, { status: 404 });
  }

  // Suppression des modules associés
  await admin.from('school_modules').delete().eq('school_id', schoolId);

  // Suppression de l'école
  const { error } = await admin.from('schools').delete().eq('id', schoolId);
  if (error) {
    return NextResponse.json(
      { error: error.message || 'Suppression impossible' },
      { status: 500 }
    );
  }

  await writeAuditLog(admin, {
    actorUserId: auth.user.id,
    action: 'school.deleted',
    entityId: schoolId,
    metadata: { name: existing.name },
  });

  return NextResponse.json({ success: true, name: existing.name });
}