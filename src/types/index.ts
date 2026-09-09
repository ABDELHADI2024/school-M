export type UserRole = 'super_admin' | 'school_admin' | 'director' | 'staff' | 'teacher' | 'parent' | 'student';

// ─── Hiérarchie des rôles SaaS ────────────────────────────────────────────────
// super_admin        : gestion globale de la plateforme, activation des 6 piliers par école
// school_admin(owner): accès complet à son école, finances, délégation au Directeur
// director           : gestion pédagogique, profs/classes, validation des bulletins
// teacher            : emploi du temps, appel, saisie des notes
// staff              : accès aux seuls modules délégués (secrétariat, vie scolaire, caisse)
// parent / student   : portails usagers — consultation uniquement
export const ROLE_DEFINITIONS: Record<UserRole, { label: string; description: string }> = {
  super_admin: { label: 'Super Admin', description: 'Gestion globale de la plateforme SaaS et activation des 6 piliers par école.' },
  school_admin: { label: 'Propriétaire', description: 'Accès complet à son école, gestion financière et délégation au Directeur.' },
  director: { label: 'Directeur', description: 'Gestion pédagogique, affectation des professeurs/classes et validation des bulletins.' },
  teacher: { label: 'Enseignant', description: 'Emploi du temps, appel et saisie des notes.' },
  staff: { label: 'Personnel', description: 'Accès aux modules délégués (Secrétariat, Vie scolaire, Caisse).' },
  parent: { label: 'Parent', description: 'Portail usager — consultation uniquement.' },
  student: { label: 'Élève', description: 'Portail usager — consultation uniquement.' },
};

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  role: UserRole;
  school_id: string | null;
  created_at?: string;
}

export interface School {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city?: string | null;
  currency?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SchoolOverview extends School {
  moduleCount: number;
  studentsCount: number;
  ownerFullName: string | null;
  ownerEmail: string | null;
}

export interface ModuleItem {
  id: string;
  name: string;
  description: string;
  is_core: boolean;
  pillar?: string | null;
}

export interface SchoolModule {
  id: string;
  school_id: string;
  module_id: string;
  is_enabled: boolean;
  module?: ModuleItem;
}

export interface UserModule {
  id: string;
  user_id: string;
  school_id: string;
  module_id: string;
  created_at?: string;
}

// ─── 6 Pilliers Métiers ──────────────────────────────────────────────────────

export interface PillierMeta {
  id: string;
  label: string;
  icon: string;
  color: string;
  modules: string[];
}

export const PILLIERS: PillierMeta[] = [
  {
    id: 'pedagogie',
    label: 'Pédagogie & Scolarité',
    icon: '🎓',
    color: 'indigo',
    modules: ['students', 'classes', 'grades', 'reports_pdf'],
  },
  {
    id: 'finances',
    label: 'Finances & Économat',
    icon: '💳',
    color: 'rose',
    modules: ['pricing', 'finance', 'cashbox', 'finance_reports'],
  },
  {
    id: 'rh',
    label: 'Ressources Humaines',
    icon: '👥',
    color: 'violet',
    modules: ['personnel', 'permissions', 'payroll'],
  },
  {
    id: 'vie_scolaire',
    label: 'Vie Scolaire',
    icon: '⏰',
    color: 'amber',
    modules: ['attendance', 'timetable', 'discipline'],
  },
  {
    id: 'services',
    label: 'Services Annexes',
    icon: '🚌',
    color: 'teal',
    modules: ['canteen', 'transport', 'boarding'],
  },
  {
    id: 'communication',
    label: 'Communication & Portails',
    icon: '📱',
    color: 'sky',
    modules: ['messaging', 'notifications', 'portal_parents', 'portal_students'],
  },
];

export const CORE_MODULES = ['students'];

export function getPillierForModule(moduleId: string): PillierMeta | undefined {
  return PILLIERS.find((p) => p.modules.includes(moduleId));
}

// ─── Flat module catalog ──────────────────────────────────────────────────────

export const ALL_MODULES: { id: string; label: string }[] = [
  { id: 'students',         label: 'Inscriptions' },
  { id: 'classes',          label: 'Classes' },
  { id: 'grades',           label: 'Notes & Bulletins' },
  { id: 'reports_pdf',      label: 'Bulletins PDF' },
  { id: 'pricing',          label: 'Grille tarifaire' },
  { id: 'finance',          label: 'Facturation' },
  { id: 'cashbox',          label: 'Caisse & Reçus' },
  { id: 'finance_reports',  label: 'Rapports financiers' },
  { id: 'personnel',        label: 'Personnel & Contrats' },
  { id: 'permissions',      label: 'Permissions' },
  { id: 'payroll',          label: 'Paie' },
  { id: 'attendance',       label: 'Émargement' },
  { id: 'timetable',        label: 'Emploi du temps' },
  { id: 'discipline',       label: 'Discipline' },
  { id: 'canteen',          label: 'Cantine' },
  { id: 'transport',        label: 'Transport' },
  { id: 'boarding',         label: 'Internat' },
  { id: 'messaging',        label: 'Messagerie' },
  { id: 'notifications',    label: 'Notifications' },
  { id: 'portal_parents',   label: 'Portail Parents' },
  { id: 'portal_students',  label: 'Portail Élèves' },
];

// ─── Permission helpers ──────────────────────────────────────────────────────

export function canDelegateTo(
  assignerRole: string,
  targetRole: string,
): boolean {
  if (assignerRole === 'super_admin') return targetRole === 'school_admin';
  if (assignerRole === 'school_admin' || assignerRole === 'owner') {
    return targetRole === 'director' || targetRole === 'staff';
  }
  if (assignerRole === 'director') return targetRole === 'staff' || targetRole === 'teacher';
  return false;
}

export function delegableModules(
  assignerModules: string[],
  assignerRole: string,
  targetRole: string,
): string[] {
  if (!canDelegateTo(assignerRole, targetRole)) return [];
  return assignerModules;
}

export function canEditUser(viewerRole: string, targetRole: string): boolean {
  if (viewerRole === 'super_admin') return true;
  if (viewerRole === 'school_admin') return targetRole !== 'school_admin';
  if (viewerRole === 'director') return targetRole === 'staff' || targetRole === 'teacher';
  return false;
}

export function sidebarModules(
  role: string,
  enabledSchoolModules: string[],
  userModules: string[],
): string[] {
  // school_admin / super_admin : accès à TOUS les modules activés de l'école
  if (role === 'school_admin' || role === 'super_admin') {
    return enabledSchoolModules;
  }
  // director / teacher / staff : uniquement les modules accordés dans user_modules
  return userModules.filter((m) => enabledSchoolModules.includes(m));
}
