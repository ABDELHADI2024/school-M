import { NextResponse, type NextRequest } from 'next/server';
import {
  getAdminClient,
  authorizeSuperAdmin,
  missingServiceKeyMessage,
} from '@/lib/users-api';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/super-admin/schools/[id]/modules
 * Met à jour l'activation d'un ou plusieurs modules de l'école.
 * Corps attendu : { "modules": { "<moduleId>": true|false, ... } }
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
  if (!body || typeof body.modules !== 'object' || body.modules === null) {
    return NextResponse.json(
      { error: 'Corps de requête invalide : modules requis' },
      { status: 400 }
    );
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  const { data: school } = await admin
    .from('schools')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!school) {
    return NextResponse.json({ error: 'Établissement introuvable' }, { status: 404 });
  }

  const moduleEntries = Object.entries(body.modules as Record<string, unknown>);
  const invalidEntry = moduleEntries.find(([, enabled]) => typeof enabled !== 'boolean');
  if (invalidEntry) {
    return NextResponse.json(
      { error: `La valeur du module « ${invalidEntry[0]} » doit être booléenne` },
      { status: 400 }
    );
  }

  const rows = moduleEntries.map(([moduleId, enabled]) => ({
    school_id: id,
    module_id: moduleId,
    is_enabled: enabled as boolean,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Aucun module à mettre à jour' }, { status: 400 });
  }

  const { error } = await admin
    .from('school_modules')
    .upsert(rows, { onConflict: 'school_id,module_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(admin, {
    actorUserId: auth.user.id,
    action: 'school.modules_updated',
    entityId: id,
    metadata: { modules: BodyToMap(body.modules) },
  });

  return NextResponse.json({ ok: true, modules: BodyToMap(body.modules) });
}

function BodyToMap(modules: unknown): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  Object.entries(modules as Record<string, unknown>).forEach(([id, enabled]) => {
    result[id] = enabled as boolean;
  });
  return result;
}