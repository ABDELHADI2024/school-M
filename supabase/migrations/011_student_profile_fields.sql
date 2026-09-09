-- Fiche élève : extension de la table students
-- Ajoute l'adresse, les antécédents médicaux et les remarques générales.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS medical_notes TEXT,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

COMMENT ON COLUMN public.students.address IS 'Adresse postale de l''élève (fiche élève)';
COMMENT ON COLUMN public.students.medical_notes IS 'Antécédents / remarques médicales';
COMMENT ON COLUMN public.students.remarks IS 'Remarques générales / appréciations diverses';
