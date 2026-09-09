-- Tables pour le module Finances & Facturation
-- Exécuter ce script dans l'éditeur SQL de Supabase

-- 1. Types de frais (grilles tarifaires)
CREATE TABLE IF NOT EXISTS fee_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_types_school ON fee_types(school_id);

-- 2. Factures / Échéances par élève
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_type_id UUID REFERENCES fee_types(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_school ON invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- 3. Paiements / Encaissements
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'card')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  note TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_school ON payments(school_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

-- RLS
ALTER TABLE fee_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- fee_types
CREATE POLICY "Authenticated users can read fee_types" ON fee_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert fee_types" ON fee_types FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update fee_types" ON fee_types FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete fee_types" ON fee_types FOR DELETE USING (auth.uid() IS NOT NULL);

-- invoices
CREATE POLICY "Authenticated users can read invoices" ON invoices FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert invoices" ON invoices FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update invoices" ON invoices FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete invoices" ON invoices FOR DELETE USING (auth.uid() IS NOT NULL);

-- payments
CREATE POLICY "Authenticated users can read payments" ON payments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert payments" ON payments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update payments" ON payments FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete payments" ON payments FOR DELETE USING (auth.uid() IS NOT NULL);

-- Fonction pour recalculer automatiquement le statut d'une facture
CREATE OR REPLACE FUNCTION update_invoice_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET amount_paid = (
    SELECT COALESCE(SUM(amount_paid), 0)
    FROM payments
    WHERE invoice_id = NEW.invoice_id
  ),
  status = CASE
    WHEN (SELECT COALESCE(SUM(amount_paid), 0) FROM payments WHERE invoice_id = NEW.invoice_id) >=
         (SELECT amount_due FROM invoices WHERE id = NEW.invoice_id) THEN 'paid'
    WHEN (SELECT COALESCE(SUM(amount_paid), 0) FROM payments WHERE invoice_id = NEW.invoice_id) > 0 THEN 'partial'
    WHEN (SELECT due_date FROM invoices WHERE id = NEW.invoice_id) < CURRENT_DATE THEN 'overdue'
    ELSE 'pending'
  END
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_invoice_status
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_status();

-- Fonction pour marquer automatiquement les factures en retard
CREATE OR REPLACE FUNCTION mark_overdue_invoices()
RETURNS void AS $$
  UPDATE invoices
  SET status = 'overdue'
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
$$ LANGUAGE sql;
