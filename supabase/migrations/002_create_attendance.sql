-- Table attendance pour l'émargement et la vie scolaire
-- Exécuter ce script dans l'éditeur SQL de Supabase

CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, student_id, date)
);

-- Index pour les recherches courantes
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(class_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- RLS (Row Level Security)
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs authentifiés d'une école peuvent lire les présences de cette école
CREATE POLICY "Authenticated users can read attendance for their school"
  ON attendance FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Les utilisateurs authentifiés peuvent insérer des présences
CREATE POLICY "Authenticated users can insert attendance"
  ON attendance FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Les utilisateurs authentifiés peuvent mettre à jour les présences
CREATE POLICY "Authenticated users can update attendance"
  ON attendance FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Les utilisateurs authentifiés peuvent supprimer des présences
CREATE POLICY "Authenticated users can delete attendance"
  ON attendance FOR DELETE
  USING (auth.uid() IS NOT NULL);
