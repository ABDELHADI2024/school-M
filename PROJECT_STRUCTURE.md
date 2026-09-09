# Cartographie du projet School SaaS

> Document mis a jour pas a pas le 8 septembre 2026 a partir du workspace present. Il decrit l'etat observe dans le depot; il ne suppose pas l'existence de chemins absents. Les repertoires `node_modules`, `.next` et `.git` sont exclus de l'arbre.
>
> **Convention d'etat** : `Connecte` signifie qu'un appel Supabase ou une route API reelle est implemente. `Statique` signifie que le rendu ne depend pas d'un appel de donnees dans ce fichier. `Partiellement connecte` signifie que le code appelle bien Supabase, mais qu'une dependance SQL locale manque ou que le flux est incomplet. `Manquant` signifie que le chemin demande n'existe pas.

# 1. ARBORESCENCE TECHNIQUE COMPLETE

Le depot n'est pas organise selon `apps/web/src` et `packages`. L'application web Next.js est directement sous `src/`; `apps/` contient uniquement l'application mobile Expo.

```text
.
|-- .env.local                         # present; valeurs non documentees ici
|-- .env.local.txt                     # present; verifier son usage et son suivi Git
|-- .gitignore
|-- AGENTS.md
|-- CLAUDE.md
|-- README.md
|-- eslint.config.mjs
|-- next-env.d.ts
|-- next.config.ts
|-- package-lock.json
|-- package.json
|-- postcss.config.mjs
|-- tsconfig.json
|-- tsconfig.tsbuildinfo
|-- vitest.config.ts
|-- .github/
|   `-- workflows/
|       `-- ci.yml
|-- .opencode/
|   |-- opencode.json
|   |-- supabase-auth.json
|   `-- tui.json
|-- .vscode/
|   `-- settings.json
|-- apps/
|   `-- mobile/
|       |-- app.json
|       |-- App.tsx
|       |-- package-lock.json
|       |-- package.json
|       |-- tsconfig.json
|       |-- assets/
|       |   |-- favicon.png
|       |   `-- icon.png
|       `-- src/
|           |-- lib/
|           |   `-- supabase.ts
|           |-- navigation/
|           |   `-- AppNavigator.tsx
|           |-- screens/
|           |   |-- LoginScreen.tsx
|           |   |-- ParentHomeScreen.tsx
|           |   `-- TeacherHomeScreen.tsx
|           `-- types/
|               `-- index.ts
|-- public/
|   `-- favicon.svg
|-- scripts/
|   |-- seed_demo_full.ts
|   `-- verify_parent_link.ps1
|-- src/
|   |-- proxy.ts
|   |-- app/
|   |   |-- favicon.ico
|   |   |-- globals.css
|   |   |-- layout.tsx
|   |   |-- page.tsx
|   |   |-- login/page.tsx
|   |   |-- logout/route.ts
|   |   |-- signup/page.tsx
|   |   |-- super-admin/
|   |   |   |-- layout.tsx
|   |   |   |-- page.tsx
|   |   |   |-- modules/page.tsx
|   |   |   `-- schools/
|   |   |       |-- page.tsx
|   |   |       `-- [id]/page.tsx
|   |   |-- [schoolSlug]/
|   |   |   |-- layout.tsx
|   |   |   |-- parent/page.tsx
|   |   |   `-- dashboard/
|   |   |       |-- layout.tsx
|   |   |       |-- page.tsx
|   |   |       |-- attendance/page.tsx
|   |   |       |-- classes/page.tsx
|   |   |       |-- communication/page.tsx
|   |   |       |   `-- notifications/page.tsx
|   |   |       |-- finance/page.tsx
|   |   |       |   `-- tarifs/page.tsx
|   |   |       |-- grades/page.tsx
|   |   |       |   `-- report-cards/page.tsx
|   |   |       |-- services/
|   |   |       |   |-- canteen/page.tsx
|   |   |       |   `-- transport/page.tsx
|   |   |       |-- students/page.tsx
|   |   |       |   `-- [id]/page.tsx
|   |   |       |-- timetable/page.tsx
|   |   |       `-- users/page.tsx
|   |   `-- api/
|   |       |-- auth/signup/route.ts
|   |       |-- users/route.ts
|   |       |-- school/
|   |       |   |-- modules/route.ts
|   |       |   |-- users/route.ts
|   |       |   |-- students/
|   |       |   |   |-- import/route.ts
|   |       |   |   |-- export/route.ts
|   |       |   |   `-- template/route.ts
|   |       |   |-- finance/
|   |       |   |   |-- dashboard/route.ts
|   |       |   |   |-- fee-types/route.ts
|   |       |   |   `-- invoices/route.ts
|   |       |   |-- payments/route.ts
|   |       |   `-- parent/pay/route.ts
|   |       `-- super-admin/schools/
|   |           |-- route.ts
|   |           `-- [id]/
|   |               |-- route.ts
|   |               `-- modules/route.ts
|   |-- components/
|   |   |-- dashboard-toast.tsx
|   |   |-- super-admin-shell.tsx
|   |   `-- toast.tsx
|   |-- lib/
|   |   |-- audit.ts
|   |   |-- finance.ts
|   |   |-- format.ts
|   |   |-- logger.ts
|   |   |-- modules.ts
|   |   |-- platform-owner.ts
|   |   |-- schools.ts
|   |   |-- slug.ts
|   |   |-- users-api.ts
|   |   |-- users-api.test.ts
|   |   |-- excel/
|   |   |   |-- attendanceExcel.ts
|   |   |   |-- financeExcel.ts
|   |   |   |-- gradesExcel.ts
|   |   |   |-- studentsExcel.ts
|   |   |   |-- studentsExcel.test.ts
|   |   |   |-- timetableExcel.ts
|   |   |   `-- usersExcel.ts
|   |   |-- pdf/
|   |   |   |-- cashReceiptPdf.ts
|   |   |   |-- reportCardPdf.ts
|   |   |   `-- schoolCertificatePdf.ts
|   |   `-- supabase/
|   |       |-- client.ts
|   |       `-- server.ts
|   `-- types/
|       |-- canDelegateTo.test.ts
|       `-- index.ts
`-- supabase/
    |-- .temp/cli-latest
    `-- migrations/
        |-- 001_create_user_profiles.sql
        |-- 002_create_attendance.sql
        |-- 003_create_finance.sql
        |-- 004_create_timetable.sql
        |-- 005_create_user_modules.sql
        |-- 006_fix_rls_school_isolation.sql
        |-- 007_missing_tables.sql
        |-- 008_cron_factures.sql
        |-- 009_add_parent_user_id.sql
        |-- 010_fix_rls_recursion.sql
        |-- 011_student_profile_fields.sql
        |-- 012_add_school_location_currency.sql
        `-- 013_create_audit_logs.sql
```

## Repertoires demandes mais absents

- `apps/web/src/` : absent. Les routes web reelles sont dans `src/app/`.
- `apps/web/` : absent.
- `packages/` : absent. Aucun package partage `ui`, `config` ou `database` n'est present.
- `src/app/[schoolSlug]/owner/`, `director/`, `secretariat/` et `teacher/` : absents. Le dashboard commun sous `dashboard/` porte actuellement les ecrans de ces profils.
- `src/app/**/actions.ts` ou autre fichier de Server Actions : absent. Le projet utilise des Route Handlers et des appels Supabase directs.

# 2. CARTOGRAPHIE PAR ROUTE & FICHIER (APPS/WEB/SRC/APP)

Le libelle `apps/web/src/app` de la demande correspond, dans ce depot, a `src/app`. Les chemins ci-dessous sont les chemins relatifs reels.

## 2.1 Layouts et routes publiques

| Route | Fichier relatif exact | Role fonctionnel | Etat | Enfants, hooks et imports locaux |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` | Landing page institutionnelle pour les visiteurs anonymes; inspecte la session et redirige les utilisateurs connectes vers `/super-admin` ou `/{schoolSlug}/dashboard`. | Connecte | Client Supabase serveur; pas de hook React; utilise `user_profiles` et `schools`; rendu avec `lucide-react` et liens `/login`. |
| Toutes les routes | `src/app/layout.tsx` | Layout HTML racine, metadata, police et styles globaux. | Statique | Importe `next/font/google` et `./globals.css`; rend les enfants. |
| `/{schoolSlug}` | `src/app/[schoolSlug]/layout.tsx` | Layout tenant; verifie le slug d'ecole et appelle `notFound()` si necessaire. | Connecte | Client Supabase serveur; lit `schools`; rend les enfants. |
| `/{schoolSlug}/dashboard` et enfants | `src/app/[schoolSlug]/dashboard/layout.tsx` | Coquille de navigation multi-piliers, profil courant, modules actifs et controle des menus. | Connecte | Client Supabase navigateur, `/api/school/modules`; hooks `use`, `useEffect`, `useState`, `useRouter`, `usePathname`; affiche dynamiquement le nom du `school_admin`/`director` avec le badge `Direction Générale`, ou `Mode Supervision Super Admin` pour un super-admin. |
| `/login` | `src/app/login/page.tsx` | Portail d'acces securise universel; authentifie email/mot de passe, verifie le profil et aiguille automatiquement selon role. | Connecte | Client Supabase navigateur; hooks `useCallback`, `useEffect`, `useState`, `useRouter`; lit `user_profiles` puis `schools`; `parent` va vers `/{schoolSlug}/parent`, les autres roles scolaires vers `/{schoolSlug}/dashboard`, `super_admin` vers `/super-admin`; gere le compte suspendu et le repli si `is_active` manque. |
| `/signup` | `src/app/signup/page.tsx` | Inscription d'un compte et creation de l'organisation via l'API. | Connecte | Hooks `useState`, `useRouter`; POST `/api/auth/signup`, puis `signInWithPassword`. |
| `/logout` POST | `src/app/logout/route.ts` | Deconnexion puis redirection vers `/login`. | Connecte | Client Supabase serveur; `auth.signOut`; `NextResponse`. |

## 2.2 Routes super-admin

| Route | Fichier relatif exact | Role fonctionnel | Etat | Enfants, hooks et imports locaux |
|---|---|---|---|---|
| `/super-admin` | `src/app/super-admin/page.tsx` | KPIs de la plateforme et activite recente, incluant les actions sensibles du journal d'audit. | Connecte, lecture seule | Client Supabase serveur; lit `schools`, `students`, `user_profiles`, `school_modules` et `audit_logs`; distingue les suppressions et actions administrateur dans le flux d'activite. |
| `/super-admin/*` | `src/app/super-admin/layout.tsx` | Garde serveur du role super-admin et redirection vers l'ecole si le profil n'est pas super-admin. | Connecte | Client Supabase serveur, `platform-owner`, logger, `SuperAdminShell`; rend les enfants. |
| `/super-admin/schools` | `src/app/super-admin/schools/page.tsx` | Liste, recherche, creation et suppression d'etablissements depuis un formulaire modal; lien direct vers le dashboard de chaque ecole. | Connecte | Hooks `useEffect`, `useMemo`, `useRef`, `useState`; `slugifyName`, `ToastStack`, `useToasts`; formulaire B2B avec nom, slug, ville, devise, coordonnees et administrateur initial; mot de passe securise generable; recapitulatif copiable avec lien `/login`; ajout/suppression dans la liste sans rechargement. |
| `/super-admin/schools/[id]` | `src/app/super-admin/schools/[id]/page.tsx` | Fiche de pilotage d'une ecole : informations, branding, statut, logo et catalogue de modules. | Connecte | Hooks `use`, `useEffect`, `useRef`, `useState`; `modules`, `ToastStack`, `useToasts`; Supabase Storage, PATCH ecole et PATCH modules; edition ville/devise/adresse; liste filtrable `Tous`, `Actifs`, `Inactifs`; toggles avec sauvegarde optimiste et rollback. |
| `/super-admin/modules` | `src/app/super-admin/modules/page.tsx` | Presentation du catalogue des modules et piliers. | Statique | Importe `PILLIERS`, `CORE_MODULES`, `modules`; pas d'appel Supabase ni hook metier. |

## 2.3 Routes ecole du dashboard commun

Ces pages sont toutes marquees `'use client'`. Elles utilisent majoritairement le client navigateur `src/lib/supabase/client.ts`, le type catalogue de `src/types/index.ts` et `useDashToasts` de `src/components/dashboard-toast.tsx` lorsqu'un toast est necessaire.

| Route | Fichier relatif exact | Role fonctionnel | Etat | Enfants, hooks et imports locaux |
|---|---|---|---|---|
| `/{schoolSlug}/dashboard` | `src/app/[schoolSlug]/dashboard/page.tsx` | Vue synthetique: effectifs, absences, notes, factures et emploi du temps. | Connecte | Hooks `use`, `useEffect`, `useState`; Supabase `schools`, `students`, `attendance`, `evaluations`, `grades`, `invoices`, `timetable_slots`. |
| `.../students` | `src/app/[schoolSlug]/dashboard/students/page.tsx` | Liste, recherche, filtres, import/export et CRUD eleves. | Connecte | Hooks `use`, `useEffect`, `useMemo`, `useRef`, `useState`, `useCallback`; `studentsExcel`; `schools`, `user_profiles`, `classes`, `students`; API import/export/template. |
| `.../students/[id]` | `src/app/[schoolSlug]/dashboard/students/[id]/page.tsx` | Fiche eleve, absences, notes, finances, changement de classe et certificat. | Connecte | Hooks `use`, `useEffect`, `useMemo`, `useState`, `useCallback`; `schoolCertificatePdf`; lit et modifie plusieurs tables. |
| `.../classes` | `src/app/[schoolSlug]/dashboard/classes/page.tsx` | Gestion des classes, matieres et enseignants. | Partiellement connecte | Hooks `use`, `useEffect`, `useMemo`, `useState`, `useCallback`; CRUD `classes` et `class_subjects`; `class_subjects` manque dans les migrations locales. |
| `.../attendance` | `src/app/[schoolSlug]/dashboard/attendance/page.tsx` | Appel, saisie, sauvegarde et export des presences. | Connecte | Hooks `use`, `useEffect`, `useState`, `useRef`, `useMemo`, `useCallback`; `attendanceExcel`; `attendance.upsert`. |
| `.../timetable` | `src/app/[schoolSlug]/dashboard/timetable/page.tsx` | Emploi du temps, conflits, salles, enseignants et export. | Connecte | Hooks `use`, `useEffect`, `useState`, `useRef`; `timetableExcel`; CRUD `timetable_slots`, `teachers`, `rooms`. |
| `.../users` | `src/app/[schoolSlug]/dashboard/users/page.tsx` | Gestion du personnel, roles, permissions et import Excel. | Connecte | Hooks `use`, `useEffect`, `useState`, `useCallback`; `usersExcel`, types de permissions; `/api/school/users` et `/api/school/modules`. |
| `.../grades` | `src/app/[schoolSlug]/dashboard/grades/page.tsx` | Creation d'evaluations, saisie/import des notes. | Partiellement connecte | Hooks `use`, `useEffect`, `useState`, `useRef`, `useMemo`, `useCallback`; `gradesExcel`; tables `evaluations` et `grades` absentes des migrations locales. |
| `.../grades/report-cards` | `src/app/[schoolSlug]/dashboard/grades/report-cards/page.tsx` | Calcul, classement et export des bulletins. | Partiellement connecte | Hooks `use`, `useEffect`, `useState`, `useMemo`; `reportCardPdf`; depend de `evaluations` et `grades` absentes. |
| `.../finance` | `src/app/[schoolSlug]/dashboard/finance/page.tsx` | Factures, KPI, encaissements et recus. | Connecte | Hooks `use`, `useEffect`, `useMemo`, `useState`, `useCallback`; `format`, `cashReceiptPdf`, `finance`; APIs finance/payments. |
| `.../finance/tarifs` | `src/app/[schoolSlug]/dashboard/finance/tarifs/page.tsx` | Types de frais et grilles de prix par classe. | Partiellement connecte | Hooks `use`, `useEffect`, `useMemo`, `useState`, `useCallback`; `format`; `fee_class_prices` et `fee_types.category` manquent dans les migrations. |
| `.../communication` | `src/app/[schoolSlug]/dashboard/communication/page.tsx` | Annonces generales ou ciblees par classe. | Partiellement connecte | Hooks `use`, `useEffect`, `useState`; toast; CRUD `announcements` et `announcement_targets`, tables absentes. |
| `.../communication/notifications` | `src/app/[schoolSlug]/dashboard/communication/notifications/page.tsx` | Journal et generation d'alertes. | Partiellement connecte | Hooks `use`, `useEffect`, `useState`; `notifications_log`, table absente des migrations. |
| `.../services/canteen` | `src/app/[schoolSlug]/dashboard/services/canteen/page.tsx` | Formules, abonnements et presence cantine. | Partiellement connecte | Hooks `use`, `useEffect`, `useState`; `format`; tables `canteen_plans`, `student_canteen_subscriptions`, `canteen_attendance` absentes. |
| `.../services/transport` | `src/app/[schoolSlug]/dashboard/services/transport/page.tsx` | Lignes, arrets et affectations de transport. | Partiellement connecte | Hooks `use`, `useEffect`, `useState`; toast; tables `bus_lines`, `bus_stops`, `bus_assignments` absentes. |
| `/{schoolSlug}/parent` | `src/app/[schoolSlug]/parent/page.tsx` | Portail parent web: enfants, absences, notes, factures, paiement et recu. | Connecte | Hooks `use`, `useEffect`, `useMemo`, `use`; `format`, `cashReceiptPdf`; lectures Supabase et POST `/api/school/parent/pay`. |

## 2.4 Routes par role demandees mais absentes

| Route attendue | Etat reel |
|---|---|
| `/{schoolSlug}/owner/**` | Manquante. Aucun dossier ni page. Le role `school_admin` est servi par le dashboard commun. |
| `/{schoolSlug}/director/**` | Manquante. Aucun dossier ni page. Le role `director` est servi par le dashboard commun. |
| `/{schoolSlug}/secretariat/**` | Manquante. Aucun dossier ni page. Le role `staff` est servi par le dashboard commun. |
| `/{schoolSlug}/teacher/**` | Manquante. Aucun dossier ni page. Le role `teacher` est servi par le dashboard commun; l'application mobile possede un ecran enseignant. |
| Server Actions (`actions.ts`, `use server`) | Manquantes. Aucun fichier de Server Actions n'a ete trouve; les mutations passent par les Route Handlers, le client Supabase navigateur ou des RPC. |

## 2.5 Route Handlers API

| Endpoint | Fichier | Role, donnees et ecritures |
|---|---|---|
| `POST /api/auth/signup` | `src/app/api/auth/signup/route.ts` | Cree Auth user, `schools`, modules par defaut et `user_profiles` avec `service_role`; supprime l'utilisateur Auth en rollback. |
| `GET/PATCH /api/users` | `src/app/api/users/route.ts` | Ancienne API utilisateurs: lecture profils/modules, changement de modules et suppression de profil; `authorizeManagerForSchool`. Doublon de `/api/school/users`. |
| `GET/POST /api/school/users` | `src/app/api/school/users/route.ts` | API principale du personnel; cree Auth + profil + modules, et lit/modifie les utilisateurs. |
| `GET /api/school/modules` | `src/app/api/school/modules/route.ts` | Retourne les modules actifs d'une ecole apres authentification. |
| `POST /api/school/students/import` | `src/app/api/school/students/import/route.ts` | Parse un fichier Excel, valide les lignes, cree les classes necessaires et insere les eleves par lot. |
| `GET /api/school/students/export` | `src/app/api/school/students/export/route.ts` | Lit eleves/classes et genere un export XLSX/CSV. |
| `GET /api/school/students/template` | `src/app/api/school/students/template/route.ts` | Genere le modele Excel d'import. |
| `GET /api/school/finance/dashboard` | `src/app/api/school/finance/dashboard/route.ts` | Lit les factures et calcule les KPI cote serveur. |
| `GET/POST/PUT /api/school/finance/fee-types` | `src/app/api/school/finance/fee-types/route.ts` | CRUD `fee_types` et `fee_class_prices`; cette derniere table manque localement. |
| `POST /api/school/finance/invoices` | `src/app/api/school/finance/invoices/route.ts` | Cree des factures individuelles ou par classe dans `invoices`. |
| `POST /api/school/payments` | `src/app/api/school/payments/route.ts` | Encaissement gestionnaire via RPC `record_payment`. |
| `POST /api/school/parent/pay` | `src/app/api/school/parent/pay/route.ts` | Verifie le lien parent-enfant puis appelle `record_payment` et journalise une notification. |
| `GET/POST/DELETE /api/super-admin/schools` | `src/app/api/super-admin/schools/route.ts` | Liste enrichie, cree et supprime des etablissements via `service_role`; POST valide le slug/devise, persiste ville/devise, cree l'utilisateur Auth initial avec email confirme, insere son profil `school_admin`, active `finance`, `attendance`, `grades`, `timetable`, et rollback l'utilisateur/ecole si une etape echoue. Retourne un recapitulatif d'identifiants pour la remise au client. DELETE supprime les modules associes puis l'ecole. |
| `PATCH /api/super-admin/schools/[id]` | `src/app/api/super-admin/schools/[id]/route.ts` | Modifie branding, coordonnees, ville, devise, slug et `is_active`; journalise `school.updated` ou `school.status_changed`. |
| `PATCH /api/super-admin/schools/[id]/modules` | `src/app/api/super-admin/schools/[id]/modules/route.ts` | Active/desactive les modules via `school_modules.upsert`; valide que chaque valeur recue est un booleen, renvoie la carte mise a jour et journalise `school.modules_updated`. |

Toutes ces routes utilisent `NextRequest`/`NextResponse`, `dynamic = 'force-dynamic'` lorsqu'une donnee de session est requise, et les helpers d'autorisation de `src/lib/users-api.ts` selon le contexte.

# 3. ETAT DE CONNEXION SUPABASE & ACTIONS

## 3.1 Clients et middleware

| Fichier | Role | Etat |
|---|---|---|
| `src/lib/supabase/client.ts` | Client navigateur `createBrowserClient` de `@supabase/ssr`, avec `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`. | Connecte |
| `src/lib/supabase/server.ts` | Client serveur `createServerClient` avec cookies Next.js; utilise les variables publiques. | Connecte |
| `src/proxy.ts` | Proxy Next.js: rafraichit la session avec `createServerClient`, lit l'utilisateur/profil/ecole et protege les routes. | Connecte; aucune mutation metier |
| `apps/mobile/src/lib/supabase.ts` | Client Expo avec persistance AsyncStorage et variables `EXPO_PUBLIC_*`. | Connecte |

Le projet utilise `src/proxy.ts` comme couche de protection/session. Il n'existe pas de fichier `middleware.ts` a la racine; ce choix doit etre conserve ou documente explicitement selon la convention Next.js 16 du projet.

## 3.2 Appels reels et mutations

Les ecrans ne reposent pas sur un state React factice pour les donnees metier: leurs `useState` contiennent l'etat de chargement, les filtres et les resultats lus depuis Supabase. Les mutations observees sont reelles:

- `students`, `classes`, `subjects`, `teachers`, `rooms`, `timetable_slots`, `attendance`, `fee_types`, `invoices`, `payments`, `user_profiles`, `user_modules`, `school_modules` et `schools` sont lus ou modifies via Supabase direct ou Route Handlers.
- La gestion super-admin des etablissements est reactive : le POST renvoie l'etablissement cree et l'interface l'ajoute immediatement; le DELETE retire la ligne localement apres succes.
- Les creations de comptes passent par Supabase Auth Admin et `user_profiles` dans les routes serveur.
- Les paiements passent par le RPC `record_payment`; le statut des factures est recalcule par trigger SQL et `mark_overdue_invoices()`.
- Les exports Excel/PDF (`src/lib/excel/*`, `src/lib/pdf/*`) sont des generateurs locaux sans acces base.
- Il n'y a aucun fichier de Server Actions; l'API HTTP est le point d'entree serveur principal.

## 3.3 Tables declarees et tables utilisees

### Tables declarees par les migrations locales

`user_profiles`, `attendance`, `fee_types`, `invoices`, `payments`, `rooms`, `teachers`, `timetable_slots`, `user_modules`, `schools`, `classes`, `students`, `subjects`, `modules`, `school_modules`, `audit_logs`, ainsi que `schools.city` et `schools.currency` depuis `012_add_school_location_currency.sql`.

Les migrations ajoutent aussi les fonctions/helpers RLS, les politiques d'isolation par ecole, les triggers de statut facture, le job pg_cron des factures en retard et les champs eleve `parent_user_id`, `address`, `medical_notes`, `remarks`.

### Dependances utilisees par le code mais absentes des migrations locales

- Notes: `evaluations`, `grades`, `class_subjects`.
- Tarifs: `fee_class_prices`, ainsi que la colonne `fee_types.category`.
- Communication: `announcements`, `announcement_targets`, `notifications_log`.
- Services: `canteen_plans`, `student_canteen_subscriptions`, `canteen_attendance`, `bus_lines`, `bus_stops`, `bus_assignments`.

La migration `012_add_school_location_currency.sql` ajoute `schools.city` et `schools.currency` (devise par defaut `MAD`) et doit etre appliquee sur les environnements existants.

Autres ecarts detectes: le code utilise `students.status` alors que le SQL declare surtout `is_active`; le code demande `subjects.default_color` alors que la migration declare `code`. La migration `001_create_user_profiles.sql` reference `schools` avant la creation de cette table dans `007_missing_tables.sql`, ce qui rend l'ordre d'execution fragile sur une base vierge.

# 4. POINTS D'ATTENTION & PROCHAINES ETAPES

## 4.1 Fichiers ou emplacements manquants/mal places

1. **Structure web demandee non presente** : `apps/web/src` et `packages` sont absents. Toute documentation ou outillage externe qui attend `apps/web/src/app` doit pointer vers `src/app` ou une migration de structure doit etre planifiee.
2. **Routes par role absentes** : aucun dossier `owner`, `director`, `secretariat` ou `teacher` sous `[schoolSlug]`. Le dashboard unique ne formalise pas encore une surface de route par role.
3. **Server Actions absentes** : les actions metier sont reparties entre composants Client, Route Handlers et RPC; la responsabilite serveur n'est pas centralisee.
4. **Migrations SQL incompletes** : les modules notes, communication, cantine et transport sont exposes par l'UI sans schema local correspondant.
5. **Conventions Next.js a clarifier** : `src/proxy.ts` remplace le nom classique `middleware.ts`; verifier la convention supportee par la version Next.js du depot avant une migration.
6. **API utilisateurs dupliquee** : `src/app/api/users/route.ts` et `src/app/api/school/users/route.ts` recouvrent des responsabilites proches et doivent etre unifiees ou explicitement differenciees.
7. **Variables d'environnement a assainir** : `.env.local` et `.env.local.txt` sont presents; verifier qu'aucun secret n'est suivi ou expose par la documentation.

## 4.2 Priorites de refactorisation

1. **P0 - Appliquer et verifier les migrations coherentes** : executer `012_add_school_location_currency.sql` sur les environnements existants, corriger l'ordre de creation `schools`, ajouter les tables/colonnes encore manquantes utilisees par l'UI, puis ajouter leurs politiques RLS par `school_id`. Sans cela, les ecrans grades, communication, services et tarifs ne sont pas deployables de bout en bout.
2. **P0 - Verifier les RPC et contrats SQL** : documenter ou migrer `record_payment`, ses controles parent/staff et les champs retournes; aligner les noms `status`/`is_active` et `default_color`.
3. **P1 - Centraliser l'autorisation serveur** : conserver `authorizeManagerForSchool`/`authorizeSuperAdmin` comme point d'entree unique, supprimer ou deprecier le doublon `/api/users`, et eviter les mutations directes depuis les composants quand une API serveur est necessaire.
4. **P1 - Formaliser les surfaces par role** : soit creer des layouts/routes `owner`, `director`, `secretariat`, `teacher`, soit documenter une matrice de permissions du dashboard commun et tester chaque role sur chaque route.
5. **P1 - Ajouter des tests d'integration** : tester auth, isolation multi-tenant RLS, import eleves, creation facture, paiement parent et acces aux nouveaux modules contre une base Supabase de test.
6. **P2 - Reduire la taille des Client Components** : extraire les formulaires et tableaux repetes en composants, puis conserver dans les pages uniquement le chargement, l'orchestration et les transitions d'interface.
7. **P2 - Stabiliser l'arbre de workspace** : decider explicitement si le projet reste une application web a la racine avec un mobile adjacent ou devient un vrai monorepo `apps/web` + `packages`; ne pas melanger les deux conventions.

## 4.3 Verification recommandee apres chaque etape

- `npm run lint`
- `npm test`
- `npm run build`
- application des migrations dans l'ordre sur une base Supabase de test
- verification manuelle des roles `super_admin`, `school_admin`, `director`, `staff`, `teacher`, `parent` et `student`
- test de non-fuite entre deux `school_id` distincts

## 4.4 Journal des mises a jour

- **Initialisation** : cartographie complete du workspace et des routes existantes.
- **Accueil** : remplacement de l'ecran minimal par une landing page institutionnelle; les redirections des sessions existantes sont conservees.
- **Authentification** : refactor de `src/app/login/page.tsx` en portail universel avec aiguillage `super_admin`, `parent` et roles scolaires; gestion du compte suspendu et repli de schema pour `is_active`.
- **CRUD etablissements** : formulaire modal enrichi avec nom, slug, ville et devise `MAD`; toasts, ajout/suppression immediats dans la liste et validation des slugs.
- **Modules obligatoires** : `src/lib/schools.ts` utilise un `upsert` idempotent et force `finance`, `attendance`, `grades`, `timetable`; l'API rollback l'ecole si cette etape echoue.
- **Schema** : ajout de `supabase/migrations/012_add_school_location_currency.sql` pour `schools.city`, `schools.currency` et la contrainte de devise.
- **Fiche établissement** : ajout de l'edition persistante ville/devise/adresse, d'une liste modules professionnelle avec filtres `Tous / Actifs / Inactifs`, statuts visibles et toggles directs.
- **Validation modules** : la route `PATCH /api/super-admin/schools/[id]/modules` refuse maintenant les valeurs non booleennes au lieu de les convertir silencieusement.
- **Audit Super Admin** : ajout de `src/lib/audit.ts` et de `supabase/migrations/013_create_audit_logs.sql`; les creations, suppressions, modifications, changements de statut et changements de modules sont maintenant traces avec l'acteur, l'entite, l'action et les metadonnees.
- **Visibilite audit** : le dashboard `/super-admin` integre les derniers evenements `audit_logs` dans l'activite recente; sans migration appliquee, les autres indicateurs restent disponibles.
- **Provisionnement B2B** : la creation d'etablissement provisionne maintenant un administrateur initial `school_admin` dans Supabase Auth et `user_profiles`, active les modules, rollback les ressources en cas d'echec et retourne un recapitulatif copiable avec le lien `/login`.
- **Contrat admin initial** : le formulaire envoie maintenant `admin: { firstName, lastName, email, password }`; l'API accepte aussi `admin*`, `admin_*` et les anciens champs `director*` pour eviter les erreurs de validation lors des integrations existantes.
- **Identite dashboard** : le header `/{schoolSlug}/dashboard` affiche le nom et `Direction Générale` pour la direction, ou `Mode Supervision Super Admin` pour un super-administrateur.
