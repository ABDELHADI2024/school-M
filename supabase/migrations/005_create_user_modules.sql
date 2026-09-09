-- Table user_modules : permissions d'accès aux modules par utilisateur et par école
-- Exécuter ce script dans l'éditeur SQL de Supabase

CREATE TABLE IF NOT EXISTS user_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, school_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_user_modules_user_id ON user_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_user_modules_school_id ON user_modules(school_id);
CREATE INDEX IF NOT EXISTS idx_user_modules_module_id ON user_modules(module_id);

ALTER TABLE user_modules ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent lire leurs propres permissions
CREATE POLICY "Users can read own modules"
  ON user_modules FOR SELECT
  USING (auth.uid() = user_id);

-- Les school_admin peuvent gérer les permissions de leur école
CREATE POLICY "School admins can manage user modules"
  ON user_modules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
        AND role = 'school_admin'
        AND school_id = user_modules.school_id
    )
  );

-- Les directors peuvent lire les permissions de leur école
CREATE POLICY "Directors can read user modules"
  ON user_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
        AND role = 'director'
        AND school_id = user_modules.school_id
    )
  );

-- Les super_admin peuvent tout lire
CREATE POLICY "Super admins can read all user modules"
  ON user_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );
