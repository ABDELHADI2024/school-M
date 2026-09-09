-- 009_add_parent_user_id.sql
-- Liaison identitaire parent ⇄ élève.
--
-- Cause racine du bug : ParentHomeScreen comparait `students.parent_email`
-- (TEXT) à l'UUID de session (`user_id`), ce qui ne matchait jamais.
-- Solution : colonne `parent_user_id` (FK → auth.users), cohérente avec le
-- modèle mono-parent existant (champs parent_name / parent_phone / parent_email).
-- Un parent peut être lié à plusieurs élèves (une ligne students par enfant).
--
-- RLS : le parent ne lit QUE ses propres enfants ; crud des élèves réservée
-- au personnel (les rôles parent/student ne peuvent plus voir toute l'école).

-- Helper : l'utilisateur appartient-il au personnel (rôles staff) ?
DROP FUNCTION IF EXISTS public.is_staff_member();
CREATE OR REPLACE FUNCTION public.is_staff_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.role IN ('school_admin', 'director', 'staff', 'teacher')
  );
$$;

-- 1) Colonne de liaison (idempotente) + index.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_parent_user ON students(parent_user_id);

COMMENT ON COLUMN students.parent_user_id
  IS 'auth.users(id) du parent lié (portail mobile). NULL tant que non lié.';

-- 2) RLS students : nettoyage des anciennes politiques (007 + versions antérieures).
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read students" ON students;
DROP POLICY IF EXISTS "Authenticated users can insert students" ON students;
DROP POLICY IF EXISTS "Authenticated users can update students" ON students;
DROP POLICY IF EXISTS "Authenticated users can delete students" ON students;
DROP POLICY IF EXISTS "School members can read students" ON students;
DROP POLICY IF EXISTS "School members can insert students" ON students;
DROP POLICY IF EXISTS "School members can update students" ON students;
DROP POLICY IF EXISTS "School members can delete students" ON students;

-- Lecture : personnel uniquement (super_admin inclus).
CREATE POLICY "Staff can read students" ON students
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_school_member(students.school_id) AND public.is_staff_member())
  );

-- Parents/élèves : uniquement leurs propres enfants.
CREATE POLICY "Parents can read their children" ON students
  FOR SELECT
  USING (parent_user_id = auth.uid());

-- Écriture : personnel uniquement.
CREATE POLICY "Staff can insert students" ON students
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_school_member(students.school_id) AND public.is_staff_member())
  );

CREATE POLICY "Staff can update students" ON students
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (public.is_school_member(students.school_id) AND public.is_staff_member())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_school_member(students.school_id) AND public.is_staff_member())
  );

CREATE POLICY "Staff can delete students" ON students
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (public.is_school_member(students.school_id) AND public.is_staff_member())
  );