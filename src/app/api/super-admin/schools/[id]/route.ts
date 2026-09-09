import { NextResponse, type NextRequest } from 'next/server';
import {
  getAdminClient,
  authorizeSuperAdmin,
  missingServiceKeyMessage,
} from '@/lib/users-api';
import { ensureUniqueSchoolSlug, slugifyName } from '@/lib/schools';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/super-admin/schools/[id]
 * Mise à jour partielle d'un établissement : identité, charte graphique,
 * coordonnées et statut (is_active). Slug rendu unique si modifié.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Identifiant d’école manquant' }, { status: 400 });
  }

  const auth = await authorizeSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  const { data: existing } = await admin
    .from('schools')
    .select('id, slug')
    .eq('id', id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Établissement introuvable' }, { status: 404 });
  }

  const updates: Record<string, string | boolean | null> = {};
  const textFields = ['name', 'phone', 'email', 'address', 'city', 'logo_url', 'primary_color', 'secondary_color'] as const;
  for (const field of textFields) {
    if (field in body) {
      const value = String(body[field] ?? '').trim();
      updates[field] = value || null;
    }
  }
  if ('is_active' in body) {
    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'Le champ is_active doit être un booléen' }, { status: 400 });
    }
    updates.is_active = body.is_active;
  }
  if ('slug' in body && typeof body.slug === 'string') {
    const slug = slugifyName(body.slug);
    if (!slug) {
      return NextResponse.json({ error: 'Le slug de l’école est invalide' }, { status: 400 });
    }
    if (slug !== existing.slug) {
      const { data: conflictingSchool } = await admin
        .from('schools')
        .select('id')
        .eq('slug', slug)
        .neq('id', id)
        .maybeSingle();
      if (conflictingSchool) {
        return NextResponse.json({ error: `Le slug « ${slug} » est déjà utilisé.` }, { status: 409 });
      }
      updates.slug = await ensureUniqueSchoolSlug(admin, slug);
    }
  }
  if ('currency' in body) {
    const currency = String(body.currency ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ error: 'La devise doit être un code ISO à 3 lettres' }, { status: 400 });
    }
    updates.currency = currency;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ school: existing }, { status: 200 });
  }

  const { data: school, error } = await admin
    .from('schools')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !school) {
    return NextResponse.json(
      { error: error?.message || 'Mise à jour impossible' },
      { status: 500 }
    );
  }

  await writeAuditLog(admin, {
    actorUserId: auth.user.id,
    action: 'is_active' in updates ? 'school.status_changed' : 'school.updated',
    entityId: id,
    metadata: { updates },
  });

  return NextResponse.json({ school });
}