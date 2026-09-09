-- Isolation multi-tenant : remplace les policies "auth.uid() IS NOT NULL"
-- (trop permissives) par des policies scopées sur school_id.
-- Exécuter ce script dans l'éditeur SQL de Supabase.
--
-- Principe :
--   - lecture : membre de l'école (user_profiles.school_id = ligne.school_id)
--               OU super_admin (accès complet en lecture)
--   - écriture : uniquement les membres de l'école concernée
--   - le role 'school_admin' / 'director' / 'staff' / 'teacher' doit être
--     rattaché à l'école via user_profiles.school_id pour pouvoir écrire.

-- Pas de DROP FUNCTION : is_super_admin() est déjà référencé par les policies
-- de user_profiles (migration 001) et par celles de 006/007 -> 2BP01 sinon.
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

-- ── 1. ATTENDANCE ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read attendance for their school" ON attendance;
DROP POLICY IF EXISTS "Authenticated users can insert attendance" ON attendance;
DROP POLICY IF EXISTS "Authenticated users can update attendance" ON attendance;
DROP POLICY IF EXISTS "Authenticated users can delete attendance" ON attendance;

CREATE POLICY "School members can read attendance" ON attendance
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = attendance.school_id
    )
  );

CREATE POLICY "School members can insert attendance" ON attendance
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = attendance.school_id
    )
  );

CREATE POLICY "School members can update attendance" ON attendance
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = attendance.school_id
    )
  );

CREATE POLICY "School members can delete attendance" ON attendance
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = attendance.school_id
    )
  );

-- ── 2. FEES / FACTURES / PAIEMENTS ────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read fee_types" ON fee_types;
DROP POLICY IF EXISTS "Authenticated users can insert fee_types" ON fee_types;
DROP POLICY IF EXISTS "Authenticated users can update fee_types" ON fee_types;
DROP POLICY IF EXISTS "Authenticated users can delete fee_types" ON fee_types;

CREATE POLICY "School members can read fee_types" ON fee_types
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = fee_types.school_id
    )
  );

CREATE POLICY "School members can insert fee_types" ON fee_types
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = fee_types.school_id
    )
  );

CREATE POLICY "School members can update fee_types" ON fee_types
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = fee_types.school_id
    )
  );

CREATE POLICY "School members can delete fee_types" ON fee_types
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = fee_types.school_id
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON invoices;

CREATE POLICY "School members can read invoices" ON invoices
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = invoices.school_id
    )
  );

CREATE POLICY "School members can insert invoices" ON invoices
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = invoices.school_id
    )
  );

CREATE POLICY "School members can update invoices" ON invoices
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = invoices.school_id
    )
  );

CREATE POLICY "School members can delete invoices" ON invoices
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = invoices.school_id
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read payments" ON payments;
DROP POLICY IF EXISTS "Authenticated users can insert payments" ON payments;
DROP POLICY IF EXISTS "Authenticated users can update payments" ON payments;
DROP POLICY IF EXISTS "Authenticated users can delete payments" ON payments;

CREATE POLICY "School members can read payments" ON payments
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = payments.school_id
    )
  );

CREATE POLICY "School members can insert payments" ON payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = payments.school_id
    )
  );

CREATE POLICY "School members can update payments" ON payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = payments.school_id
    )
  );

CREATE POLICY "School members can delete payments" ON payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = payments.school_id
    )
  );

-- ── 3. SALLES (ROOMS) ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read rooms" ON rooms;
DROP POLICY IF EXISTS "Authenticated users can insert rooms" ON rooms;
DROP POLICY IF EXISTS "Authenticated users can update rooms" ON rooms;
DROP POLICY IF EXISTS "Authenticated users can delete rooms" ON rooms;

CREATE POLICY "School members can read rooms" ON rooms
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = rooms.school_id
    )
  );

CREATE POLICY "School members can insert rooms" ON rooms
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = rooms.school_id
    )
  );

CREATE POLICY "School members can update rooms" ON rooms
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = rooms.school_id
    )
  );

CREATE POLICY "School members can delete rooms" ON rooms
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = rooms.school_id
    )
  );

-- ── 4. PROFESSEURS (TEACHERS) ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read teachers" ON teachers;
DROP POLICY IF EXISTS "Authenticated users can insert teachers" ON teachers;
DROP POLICY IF EXISTS "Authenticated users can update teachers" ON teachers;
DROP POLICY IF EXISTS "Authenticated users can delete teachers" ON teachers;

CREATE POLICY "School members can read teachers" ON teachers
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = teachers.school_id
    )
  );

CREATE POLICY "School members can insert teachers" ON teachers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = teachers.school_id
    )
  );

CREATE POLICY "School members can update teachers" ON teachers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = teachers.school_id
    )
  );

CREATE POLICY "School members can delete teachers" ON teachers
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = teachers.school_id
    )
  );

-- ── 5. CRÉNEAUX D'EMPLOI DU TEMPS (TIMETABLE_SLOTS) ──────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read timetable_slots" ON timetable_slots;
DROP POLICY IF EXISTS "Authenticated users can insert timetable_slots" ON timetable_slots;
DROP POLICY IF EXISTS "Authenticated users can update timetable_slots" ON timetable_slots;
DROP POLICY IF EXISTS "Authenticated users can delete timetable_slots" ON timetable_slots;

CREATE POLICY "School members can read timetable_slots" ON timetable_slots
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = timetable_slots.school_id
    )
  );

CREATE POLICY "School members can insert timetable_slots" ON timetable_slots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = timetable_slots.school_id
    )
  );

CREATE POLICY "School members can update timetable_slots" ON timetable_slots
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = timetable_slots.school_id
    )
  );

CREATE POLICY "School members can delete timetable_slots" ON timetable_slots
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.school_id = timetable_slots.school_id
    )
  );