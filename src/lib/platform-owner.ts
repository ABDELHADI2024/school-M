// Email(s) traités comme propriétaire de la plateforme (équivalent super_admin).
// Priorité à la variable d'environnement ; le fallback littéral garantit l'accès
// du propriétaire même si l'environnement de déploiement ne l'a pas définie.
const PLATFORM_OWNER_EMAIL = process.env.SUPER_ADMIN_OVERRIDE_EMAIL?.trim().toLowerCase() || '';

const FALLBACK_PLATFORM_OWNER_EMAIL = 'galaxprap@gmail.com';

const PLATFORM_OWNER_EMAILS: ReadonlySet<string> = new Set(
  [PLATFORM_OWNER_EMAIL, FALLBACK_PLATFORM_OWNER_EMAIL]
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

export function isPlatformOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  return PLATFORM_OWNER_EMAILS.has(email.trim().toLowerCase());
}