# School SaaS

Plateforme multi-tenant de gestion scolaire intelligente (web + mobile).

## Stack

- **Web** : [Next.js 16](https://nextjs.org) (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- **Backend / BDD** : [Supabase](https://supabase.com) (PostgreSQL, Auth, RLS, pg_cron)
- **Mobile** : React Native / Expo 52 (console enseignant & espace parent/élève)
- **Excel / PDF** : exceljs, jspdf, jspdf-autotable
- **Tests** : Vitest

## Structure

```
├── src/
│   ├── app/                      # Routes Next.js (App Router)
│   │   ├── [schoolSlug]/dashboard/   # Écrans école : voix, élèves, enseignants,
│   │   │                             #   échéances, notes, bulletins, emploi du temps
│   │   ├── api/                  # Routes API (auth/signup, school/modules, users…)
│   │   ├── login|signup|logout   # Authentification web
│   │   └── super-admin/          # Console plateforme (écoles, catalogue modules)
│   ├── lib/                      # Clients Supabase, authorizeManagerForSchool,
│   │   │                         #   logger, exports Excel, génération PDF
│   ├── proxy.ts                  # Middleware (session, protection de routes)
│   └── types/                    # Catalogue modules, piliers, helpers de permissions
├── supabase/migrations/          # SQL 001 → 008 (RLS, tables, triggers, cron)
├── apps/mobile/                  # Application Expo
└── public/                       # favicon, assets statiques
```

## Variables d'environnement

Créer un fichier `.env.local` à la racine :

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

- `SUPABASE_SERVICE_ROLE_KEY` : utilisée côté serveur pour les opérations
  administratives (API Utilisateurs). Sans elle, les fonctions concernées
  renvoient une erreur explicite.
- `SUPER_ADMIN_OVERRIDE_EMAIL` *(optionnelle, désactivée par défaut)* : email
  traité comme propriétaire de la plateforme (accès total).

Mobile (`apps/mobile/.env`) :

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

## Base de données & migrations

Appliquer chaque fichier dans l'ordre via l'éditeur SQL de Supabase :

| Fichier | Contenu |
| --- | --- |
| `001_create_user_profiles.sql` | Profils utilisateurs + RLS (multi-tenant) |
| `002_create_attendance.sql` | Classes, élèves, demande de présence |
| `003_create_finance.sql` | Frais, factures, paiements, trigger de statut |
| `004_create_timetable.sql` | Emploi du temps (créneaux, salles, matières, enseignants) |
| `005_create_user_modules.sql` | Verrouillage par module / attribué |
| `006_fix_rls_school_isolation.sql` | Isolation stricte par `school_id` |
| `007_missing_tables.sql` | Établissements, classes, élèves, matières, catalogue modules |
| `008_cron_factures.sql` | Trigger « statut facture » à la source + planification `mark_overdue_invoices()` |
| `009_add_parent_user_id.sql` | Liaison parent ⇄ élève : colonne `students.parent_user_id` (FK `auth.users`) + RLS resserrée (parents = leurs enfants, écriture réservée au staff) |

Pour `008` : une fois **pg_cron** activé (Supabase → Settings → Database →
Extensions), le job est créé automatiquement à l'application de la migration.

> Le statut d'une facture (`pending`, `partial`, `paid`, `overdue`) est calculé
> **exclusivement en base** (triggers). Le code ne fait que le lire.

## Commandes

```bash
npm run dev       # serveur de développement (http://localhost:3000)
npm run build     # build de production
npm run start     # serveur du build
npm run lint      # ESLint
npm test          # tests Vitest (autorisations, permissions)

cd apps/mobile
npm start         # Expo (console enseignant / espace parent)
```

## Tests

- `src/lib/users-api.test.ts` : matrice d'autorisation `authorizeManagerForSchool`
  (non authentifié, super_admin, school_admin, directeur, rôle non autorisé, sans profil).
- `src/types/canDelegateTo.test.ts` : règles de délégation entre rôles.

```bash
npm test
```

## Authentification & rôles

Rôles : `super_admin`, `school_admin`, `director`, `staff`, `teacher`, `parent`, `student`.

- Le premier compte de la plateforme doit être inscrit avec le rôle
  `super_admin` (voir `001_create_user_profiles.sql`).
- L'accès à une école est vérifié via le `school_id` du profil
  (`authorizeManagerForSchool`) — Double lecture RLS puis clé service si nécessaire.