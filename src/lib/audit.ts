import type { AdminClient } from '@/lib/schools';

export type AuditAction =
  | 'school.created'
  | 'school.updated'
  | 'school.deleted'
  | 'school.status_changed'
  | 'school.modules_updated';

export async function writeAuditLog(
  admin: AdminClient,
  entry: {
    actorUserId: string;
    action: AuditAction;
    entityId: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await admin.from('audit_logs').insert({
    actor_user_id: entry.actorUserId,
    action: entry.action,
    entity_type: 'school',
    entity_id: entry.entityId,
    metadata: entry.metadata ?? {},
  });

  if (error) {
    console.warn('[audit] journalisation impossible :', error.message);
  }
}
