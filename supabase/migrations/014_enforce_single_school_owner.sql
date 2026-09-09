-- Garantit la règle métier : une école possède au maximum un Owner.
-- Les profils super_admin restent hors de cette contrainte car school_id peut
-- être NULL pour le propriétaire de la plateforme.

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_one_owner_per_school_idx
  ON public.user_profiles (school_id)
  WHERE role = 'school_admin' AND school_id IS NOT NULL;