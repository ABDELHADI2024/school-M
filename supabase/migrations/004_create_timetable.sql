-- Tables pour le module Emploi du Temps
-- Exécuter ce script dans l'éditeur SQL de Supabase

-- 1. Salles / Locaux
CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 30,
  type TEXT NOT NULL DEFAULT 'classroom' CHECK (type IN ('classroom', 'lab', 'sport', 'library', 'computer', 'auditorium', 'other')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_school ON rooms(school_id);

-- 2. Professeurs / Enseignants
CREATE TABLE IF NOT EXISTS teachers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  specialty TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);

-- 3. Créneaux d'emploi du temps
CREATE TABLE IF NOT EXISTS timetable_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  color TEXT DEFAULT '#4F46E5',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timetable_school ON timetable_slots(school_id);
CREATE INDEX IF NOT EXISTS idx_timetable_class ON timetable_slots(class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_room ON timetable_slots(room_id);
CREATE INDEX IF NOT EXISTS idx_timetable_day ON timetable_slots(day_of_week);

-- RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;

-- rooms
CREATE POLICY "Authenticated users can read rooms" ON rooms FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert rooms" ON rooms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update rooms" ON rooms FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete rooms" ON rooms FOR DELETE USING (auth.uid() IS NOT NULL);

-- teachers
CREATE POLICY "Authenticated users can read teachers" ON teachers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert teachers" ON teachers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update teachers" ON teachers FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete teachers" ON teachers FOR DELETE USING (auth.uid() IS NOT NULL);

-- timetable_slots
CREATE POLICY "Authenticated users can read timetable_slots" ON timetable_slots FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert timetable_slots" ON timetable_slots FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update timetable_slots" ON timetable_slots FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete timetable_slots" ON timetable_slots FOR DELETE USING (auth.uid() IS NOT NULL);
