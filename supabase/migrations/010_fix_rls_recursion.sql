-- 010_fix_rls_recursion.sql
-- Correction de la récursion RLS "42P17 infinite recursion detected in policy
-- for relation user_profiles".
--
-- Cause racine (migration 001) : les policies RLS de user_profiles s'auto-
-- référencent (EXISTS SELECT 1 FROM user_profiles ... dans leur expression).
-- PostgreSQL applique la RLS sur la table *cible* de chaque SELECT interne des
-- policies de cette même table -> boucle infinie détectée au plan (42P17).
-- Toute requête authentifiée (non bypass) touchant user_profiles - directement
-- ou via une policy d'une autre table qui fait SELECT sur user_profiles -
-- échoue alors en HTTP 500. C'est le cas de students (tests parent/staff).
--
-- Fix : les policies de user_profiles délèguent le contrôle de rôle à des
-- helpers SECURITY DEFINER, qui by-passent la RLS en interne (plus de
-- self-reference). Les policies students (009) sont ré-affirmées pour que le
-- parent ne voie que ses enfants et le staff toute la classe.
-- Idempotent : à coller dans l'éditeur SQL Supabase.
--
-- NOTE : relancer ensuite scripts\verify_parent_link.ps1 (fixture existante,
-- idempotente) pour constater le Bilan : 3 PASS / 0 FAIL.

-- ── 1. Helpers de rôle (SECURITY DEFINER = pas de RLS en interne) ────────────
-- is_super_admin() (006), is_school_member(uuid) (007), is_staff_member() (009)
-- sont re-déclarés identiques ; is_school_admin(uuid) est ajouté.
--
-- NB : PAS de DROP FUNCTION ici. is_super_admin() est référencé par 19 policies
-- (attendance, fee_types, invoices, payments, rooms, teachers, timetable_slots,
-- schools, classes, subjects, modules, school_modules) : un DROP lèverait
-- "2BP01 cannot drop function is_super_admin() because other objects depend
-- on it". La signature ne change pas (RETURNS boolean, identique à 001/006),
-- donc CREATE OR REPLACE suffit et préserve ces 19 policies existantes.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

-- Signature identique à 007 (target_school_id uuid -> boolean) : CREATE OR
-- REPLACE suffit, aucune policy dépendante n'est cassée.
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

-- Nouvelle fonction (déclarée en 001) : aucun objet dépendant, CREATE OR
-- REPLACE seul suffit.
CREATE OR REPLACE FUNCTION public.is_school_admin(target_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.role = 'school_admin'
      AND up.school_id = target_school_id
  );
$$;

-- Signature identique à 009 (RETURNS boolean) : CREATE OR REPLACE suffit.
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

-- ── 2. USER_PROFILES : policies sans auto-référence ─────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Super admins can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Super admins can create profiles" ON user_profiles;
DROP POLICY IF EXISTS "School admins can create profiles for their school" ON user_profiles;
DROP POLICY IF EXISTS "School admins can read profiles of their school" ON user_profiles;

-- Lecture : chacun sur son propre profil, admins sur le profil concerné.
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Super admins can read all profiles" ON user_profiles
  FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "School admins can read profiles of their school" ON user_profiles
  FOR SELECT
  USING (public.is_school_admin(user_profiles.school_id));

-- Création : super_admin partout, school_admin pour sa propre école.
CREATE POLICY "Super admins can create profiles" ON user_profiles
  FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY "School admins can create profiles for their school" ON user_profiles
  FOR INSERT
  WITH CHECK (public.is_school_admin(user_profiles.school_id));

-- Mise à jour : chacun sur son propre profil.
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ── 3. STUDENTS : policies de la migration 009 ré-affirmées ─────────────────
-- (La base live ne les reflétait pas : les lectures students touchaient
-- user_profiles en sous-requête inline, d'où la récursion. On repart sur les
-- helpers DEFINER : le parent ne lit que ses enfants, le staff toute la classe.)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read students" ON students;
DROP POLICY IF EXISTS "Authenticated users can insert students" ON students;
DROP POLICY IF EXISTS "Authenticated users can update students" ON students;
DROP POLICY IF EXISTS "Authenticated users can delete students" ON students;
DROP POLICY IF EXISTS "School members can read students" ON students;
DROP POLICY IF EXISTS "School members can insert students" ON students;
DROP POLICY IF EXISTS "School members can update students" ON students;
DROP POLICY IF EXISTS "School members can delete students" ON students;

CREATE POLICY "Staff can read students" ON students
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_school_member(students.school_id) AND public.is_staff_member())
  );

CREATE POLICY "Parents can read their children" ON students
  FOR SELECT
  USING (parent_user_id = auth.uid());

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