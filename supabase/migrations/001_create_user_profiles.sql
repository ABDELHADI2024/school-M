-- Table user_profiles pour gérer les rôles et les associations aux écoles
-- Exécuter ce script dans l'éditeur SQL de Supabase

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'school_admin' CHECK (role IN (
    'super_admin',
    'school_admin',
    'director',
    'staff',
    'teacher',
    'parent',
    'student'
  )),
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les recherches par user_id et school_id
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_school_id ON user_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- RLS (Row Level Security)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Helpers de rôle. SECURITY DEFINER indispensable : une policy RLS de
-- user_profiles contenant `SELECT ... FROM user_profiles` s'auto-référence et
-- PostgreSQL la rejette au plan avec "42P17 infinite recursion detected in
-- policy for relation user_profiles" (donc HTTP 500 sur toute requête
-- authentifiée touchant user_profiles, directement ou via une sous-requête
-- d'une autre table). Via function : la requête interne by-passe la RLS.
-- Pas de DROP FUNCTION : en re-exécution, les policies créées ci-dessous
-- (et celles des migrations 006+) référencent is_super_admin() -> 2BP01.
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

-- Les utilisateurs peuvent lire leur propre profil
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Les utilisateurs peuvent mettre à jour leur propre profil
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Les super_admin peuvent tout lire
CREATE POLICY "Super admins can read all profiles"
  ON user_profiles FOR SELECT
  USING (public.is_super_admin());

-- Les super_admin peuvent créer des profils
CREATE POLICY "Super admins can create profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (public.is_super_admin());

-- Les school_admin peuvent créer des profils pour leur propre école
CREATE POLICY "School admins can create profiles for their school"
  ON user_profiles FOR INSERT
  WITH CHECK (public.is_school_admin(user_profiles.school_id));

-- Les school_admin peuvent lire les profils de leur école
CREATE POLICY "School admins can read profiles of their school"
  ON user_profiles FOR SELECT
  USING (public.is_school_admin(user_profiles.school_id));
