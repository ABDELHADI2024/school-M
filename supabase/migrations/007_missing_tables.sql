-- Rattrapage : tables métier créées manuellement dans l'éditeur SQL Supabase
-- (non reproductibles). Cette migration les déclare formellement avec leurs FK,
-- index et policies RLS. Idempotente : les tables déjà présentes ne sont modifiées
-- que par l'ajout/remplacement des policies RLS.
-- Exécuter ce script dans l'éditeur SQL de Supabase.

DROP FUNCTION IF EXISTS public.is_school_member(uuid);
CREATE OR REPLACE FUNCTION public.is_school_member(target_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.user_id = auth.uid() AND up.school_id = target_school_id
  );
$$;

-- ── 1. SCHOOLS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR NOT NULL,
  slug VARCHAR NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color VARCHAR DEFAULT '#2563eb',
  secondary_color VARCHAR DEFAULT '#1e40af',
  phone VARCHAR,
  email VARCHAR,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_slug ON schools(slug);
CREATE INDEX IF NOT EXISTS idx_schools_is_active ON schools(is_active);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read schools" ON schools;
DROP POLICY IF EXISTS "Authenticated users can insert schools" ON schools;
DROP POLICY IF EXISTS "Authenticated users can update schools" ON schools;
DROP POLICY IF EXISTS "Authenticated users can delete schools" ON schools;

-- Lecture par tout utilisateur authentifié (résolution de schoolSlug, login,
-- listing super admin). Les données scolaires ne sont pas sensibles en lecture.
CREATE POLICY "Authenticated users can read schools" ON schools
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Création : uniquement les super_admin (création client-side du back-office).
CREATE POLICY "Super admins can insert schools" ON schools
  FOR INSERT
  WITH CHECK (public.is_super_admin());

-- Mise à jour : super_admin, ou le school_admin de l'école concernée.
CREATE POLICY "Super admins or school admins can update schools" ON schools
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'school_admin' AND up.school_id = schools.id
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'school_admin' AND up.school_id = schools.id
    )
  );

CREATE POLICY "Super admins can delete schools" ON schools
  FOR DELETE
  USING (public.is_super_admin());

-- ── 2. CLASSES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  level VARCHAR,
  academic_year VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read classes" ON classes;
DROP POLICY IF EXISTS "Authenticated users can insert classes" ON classes;
DROP POLICY IF EXISTS "Authenticated users can update classes" ON classes;
DROP POLICY IF EXISTS "Authenticated users can delete classes" ON classes;

CREATE POLICY "School members can read classes" ON classes
  FOR SELECT
  USING (public.is_super_admin() OR public.is_school_member(classes.school_id));

CREATE POLICY "School members can insert classes" ON classes
  FOR INSERT
  WITH CHECK (public.is_school_member(classes.school_id));

CREATE POLICY "School members can update classes" ON classes
  FOR UPDATE
  USING (public.is_school_member(classes.school_id))
  WITH CHECK (public.is_school_member(classes.school_id));

CREATE POLICY "School members can delete classes" ON classes
  FOR DELETE
  USING (public.is_school_member(classes.school_id));

-- ── 3. STUDENTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  matricule VARCHAR,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  gender VARCHAR,
  birth_date DATE,
  parent_name VARCHAR,
  parent_phone VARCHAR,
  parent_email VARCHAR,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, matricule)
);

-- Rattrapage : la contrainte UNIQUE (school_id, matricule) est requise par
-- l'upsert de la page students (onConflict: 'school_id,matricule'). Pour une
-- table déjà créée manuellement, on l'ajoute si elle manque.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_school_id_matricule_key' AND conrelid = 'students'::regclass
  ) THEN
    ALTER TABLE students ADD CONSTRAINT students_school_id_matricule_key UNIQUE (school_id, matricule);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_matricule ON students(matricule);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read students" ON students;
DROP POLICY IF EXISTS "Authenticated users can insert students" ON students;
DROP POLICY IF EXISTS "Authenticated users can update students" ON students;
DROP POLICY IF EXISTS "Authenticated users can delete students" ON students;

CREATE POLICY "School members can read students" ON students
  FOR SELECT
  USING (public.is_super_admin() OR public.is_school_member(students.school_id));

CREATE POLICY "School members can insert students" ON students
  FOR INSERT
  WITH CHECK (public.is_school_member(students.school_id));

CREATE POLICY "School members can update students" ON students
  FOR UPDATE
  USING (public.is_school_member(students.school_id))
  WITH CHECK (public.is_school_member(students.school_id));

CREATE POLICY "School members can delete students" ON students
  FOR DELETE
  USING (public.is_school_member(students.school_id));

-- ── 4. SUBJECTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  code VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read subjects" ON subjects;
DROP POLICY IF EXISTS "Authenticated users can insert subjects" ON subjects;
DROP POLICY IF EXISTS "Authenticated users can update subjects" ON subjects;
DROP POLICY IF EXISTS "Authenticated users can delete subjects" ON subjects;

CREATE POLICY "School members can read subjects" ON subjects
  FOR SELECT
  USING (public.is_super_admin() OR public.is_school_member(subjects.school_id));

CREATE POLICY "School members can insert subjects" ON subjects
  FOR INSERT
  WITH CHECK (public.is_school_member(subjects.school_id));

CREATE POLICY "School members can update subjects" ON subjects
  FOR UPDATE
  USING (public.is_school_member(subjects.school_id))
  WITH CHECK (public.is_school_member(subjects.school_id));

CREATE POLICY "School members can delete subjects" ON subjects
  FOR DELETE
  USING (public.is_school_member(subjects.school_id));

-- ── 5. MODULES (catalogue global, sans school_id) ────────────────────────────
CREATE TABLE IF NOT EXISTS modules (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  is_core BOOLEAN NOT NULL DEFAULT false,
  pillar TEXT
);

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read modules" ON modules;
DROP POLICY IF EXISTS "Authenticated users can insert modules" ON modules;
DROP POLICY IF EXISTS "Authenticated users can update modules" ON modules;
DROP POLICY IF EXISTS "Authenticated users can delete modules" ON modules;

-- Catalogue global : lisible par tout utilisateur authentifié.
CREATE POLICY "Authenticated users can read modules" ON modules
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can insert modules" ON modules
  FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update modules" ON modules
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can delete modules" ON modules
  FOR DELETE
  USING (public.is_super_admin());

-- Seed idempotent du catalogue (9 modules, aligné sur src/types/index.ts).
INSERT INTO modules (id, name, description, is_core, pillar) VALUES
  ('students',   'Inscriptions',          'Gestion des inscriptions et dossiers élèves.', true,  'pedagogie'),
  ('attendance', 'Émargement',            'Pointage des présences quotidiennes.',         false, 'pedagogie'),
  ('grades',     'Notes & Bulletins',     'Saisie des notes et génération des bulletins.', false, 'pedagogie'),
  ('timetable',  'Emploi du temps',       'Planification des créneaux de cours.',         false, 'pedagogie'),
  ('finance',    'Facturation & Caisse',  'Échéances, encaissements et caisse.',          false, 'finances'),
  ('users',      'Personnel & Permissions', 'Comptes du personnel et rôles.',            false, 'rh'),
  ('canteen',    'Cantine',               'Repas et cantine scolaire.',                  false, 'services'),
  ('transport',  'Transport scolaire',    'Gestion des lignes de transport.',            false, 'services'),
  ('portal',     'Portail Parents & Mobile', 'Portail de consultation parents/élèves.',  false, 'communication')
ON CONFLICT (id) DO NOTHING;

-- ── 6. SCHOOL_MODULES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS school_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  module_id VARCHAR NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_modules_school ON school_modules(school_id);
CREATE INDEX IF NOT EXISTS idx_school_modules_module ON school_modules(module_id);

ALTER TABLE school_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read school_modules" ON school_modules;
DROP POLICY IF EXISTS "Authenticated users can insert school_modules" ON school_modules;
DROP POLICY IF EXISTS "Authenticated users can update school_modules" ON school_modules;
DROP POLICY IF EXISTS "Authenticated users can delete school_modules" ON school_modules;

CREATE POLICY "School members can read school_modules" ON school_modules
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_school_member(school_modules.school_id)
  );

CREATE POLICY "Super admins or school admins can insert school_modules" ON school_modules
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'school_admin' AND up.school_id = school_modules.school_id
    )
  );

CREATE POLICY "Super admins or school admins can update school_modules" ON school_modules
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'school_admin' AND up.school_id = school_modules.school_id
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'school_admin' AND up.school_id = school_modules.school_id
    )
  );

CREATE POLICY "Super admins or school admins can delete school_modules" ON school_modules
  FOR DELETE
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'school_admin' AND up.school_id = school_modules.school_id
    )
  );