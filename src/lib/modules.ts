import {
  GraduationCap,
  BookOpen,
  FileText,
  ClipboardCheck,
  CalendarDays,
  Banknote,
  Receipt,
  BarChart3,
  Users,
  ShieldCheck,
  Wallet,
  Clock,
  Briefcase,
  UtensilsCrossed,
  Bus,
  Building2,
  MessageSquare,
  Bell,
  Smartphone,
  GraduationCap as StudentIcon,
  Layers,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';

export interface ModuleMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  description: string;
}

const MODULE_MAP: Record<string, ModuleMeta> = {
  students:         { label: 'Inscriptions',            icon: GraduationCap,   color: 'text-indigo-600',   description: 'Gestion des inscriptions, réinscriptions et dossiers élèves.' },
  classes:          { label: 'Classes',                 icon: Users,           color: 'text-indigo-500',   description: 'Organisation des classes, niveaux et affectations.' },
  grades:           { label: 'Notes & Bulletins',       icon: BookOpen,        color: 'text-amber-600',    description: 'Saisie des notes, moyennes et génération des bulletins.' },
  reports_pdf:      { label: 'Bulletins PDF',           icon: FileText,        color: 'text-amber-500',    description: 'Génération et export des bulletins scolaires en PDF.' },
  pricing:          { label: 'Grille tarifaire',        icon: CreditCard,      color: 'text-rose-500',     description: 'Configuration des frais scolaires par niveau et classe.' },
  finance:          { label: 'Facturation',             icon: Banknote,        color: 'text-rose-600',     description: 'Facturation automatique, suivi des paiements et relances.' },
  cashbox:          { label: 'Caisse & Reçus',          icon: Receipt,         color: 'text-rose-500',     description: 'Encaissements, reçus de paiement et rapprochement caisse.' },
  finance_reports:  { label: 'Rapports financiers',     icon: BarChart3,       color: 'text-rose-400',     description: 'Tableaux de bord financiers, trésorerie et prévisions.' },
  personnel:        { label: 'Personnel & Contrats',    icon: Briefcase,       color: 'text-violet-600',   description: 'Gestion des fiches personnelles, contrats et documents.' },
  permissions:      { label: 'Permissions',             icon: ShieldCheck,     color: 'text-violet-500',   description: 'Gestion des congés, absences et autorisations du personnel.' },
  payroll:          { label: 'Paie',                    icon: Wallet,          color: 'text-violet-400',   description: 'Calcul de la paie, bulletins de salaire et cotisations.' },
  attendance:       { label: 'Émargement',              icon: ClipboardCheck,  color: 'text-emerald-600',  description: 'Appel numérique, suivi des présences et absences.' },
  timetable:        { label: 'Emploi du temps',         icon: CalendarDays,    color: 'text-sky-600',      description: 'Planification des cours, salles et emplois du temps.' },
  discipline:       { label: 'Discipline',              icon: Clock,           color: 'text-amber-700',    description: 'Suivi des incidents, sanctions et rapports de discipline.' },
  canteen:          { label: 'Cantine',                 icon: UtensilsCrossed, color: 'text-orange-600',   description: 'Gestion des menus, repas et suivi nutritionnel.' },
  transport:        { label: 'Transport',               icon: Bus,             color: 'text-teal-600',     description: 'Gestion des bus, itinéraires et suivi des trajets.' },
  boarding:         { label: 'Internat',                icon: Building2,       color: 'text-teal-500',     description: 'Gestion des chambres, affectations et vie quotidienne.' },
  messaging:        { label: 'Messagerie',              icon: MessageSquare,   color: 'text-sky-500',      description: 'Messagerie interne entre enseignants, parents et administration.' },
  notifications:    { label: 'Notifications',           icon: Bell,            color: 'text-sky-400',      description: 'Alertes push, notifications par SMS et email automatiques.' },
  portal_parents:   { label: 'Portail Parents',         icon: Smartphone,      color: 'text-sky-600',      description: 'Espace dédié aux parents : notes, absences, paiements.' },
  portal_students:  { label: 'Portail Élèves',          icon: StudentIcon,     color: 'text-cyan-600',     description: 'Espace dédié aux élèves : emploi du temps, notes, devoirs.' },
};

export interface PillierMeta {
  label: string;
  icon: LucideIcon;
  color: string;
}

const PILLAR_MAP: Record<string, PillierMeta> = {
  pedagogie:     { label: 'Pédagogie & Scolarité',       icon: GraduationCap,   color: 'text-indigo-600' },
  finances:      { label: 'Finances & Économat',          icon: Banknote,        color: 'text-rose-600' },
  rh:            { label: 'Ressources Humaines',          icon: Users,           color: 'text-violet-600' },
  vie_scolaire:  { label: 'Vie Scolaire',                 icon: Clock,           color: 'text-amber-600' },
  services:      { label: 'Services Annexes',             icon: Bus,             color: 'text-teal-600' },
  communication: { label: 'Communication & Portails',     icon: Smartphone,      color: 'text-sky-600' },
  direction:     { label: 'Direction & Pilotage',         icon: BarChart3,       color: 'text-slate-600' },
};

const FALLBACK_MODULE: ModuleMeta = { label: '', icon: Layers, color: 'text-slate-500', description: '' };
const FALLBACK_PILLAR: PillierMeta = { label: '', icon: Layers, color: 'text-slate-500' };

export function getModuleMeta(code: string, name?: string): ModuleMeta {
  const mapped = MODULE_MAP[code];
  if (mapped) return mapped;
  return { ...FALLBACK_MODULE, label: name || code };
}

export function getPillarMeta(code: string): PillierMeta {
  return PILLAR_MAP[code] || FALLBACK_PILLAR;
}
