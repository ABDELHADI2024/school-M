import { getAdminClient } from '@/lib/users-api';
import { ALL_MODULES } from '@/types';
import { slugifyName } from '@/lib/slug';

export type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

export { slugifyName };

export async function ensureUniqueSchoolSlug(
  admin: AdminClient,
  base: string
): Promise<string> {
  let slug = base;
  let counter = 2;
  for (;;) {
    const { data: existing } = await admin
      .from('schools')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) return slug;
    slug = `${base}-${counter++}`;
  }
}

export async function getModuleCatalog(admin: AdminClient) {
  const { data } = await admin.from('modules').select('*').order('name');
  return (data ?? []) as { id: string; name: string; description: string | null; is_core: boolean }[];
}

/**
 * Active les modules par défaut d'une école fraîchement créée.
 * Priorité au catalogue métier de la table `modules` (is_core activés) ;
 * à défaut, catalogue applicatif complet (ALL_MODULES) tout activé.
 */
export async function activateDefaultModules(
  admin: AdminClient,
  schoolId: string
): Promise<number> {
  const requiredModuleIds = new Set(['finance', 'attendance', 'grades', 'timetable']);
  const catalog = await getModuleCatalog(admin);
  const defs =
    catalog.length > 0
      ? catalog.map((m) => ({
          school_id: schoolId,
          module_id: m.id,
          is_enabled: m.is_core || requiredModuleIds.has(m.id),
        }))
      : ALL_MODULES.map((m) => ({
          school_id: schoolId,
          module_id: m.id,
          is_enabled: true,
        }));

  const { error } = await admin
    .from('school_modules')
    .upsert(defs, { onConflict: 'school_id,module_id' });
  if (error) throw new Error(error.message);

  return defs.filter((module) => module.is_enabled).length;
}