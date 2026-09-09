-- 008_cron_factures.sql
-- Le statut des factures est calculé UNIQUEMENT en base (trigger), jamais en JS.
-- 1. Trigger : recalcul du statut quand les conditions d'une facture changent
--    (libellé, montant dû, échéance) — en plus du trigger existant sur les
--    paiements (003_create_finance.sql).
-- 2. Planification pg_cron de mark_overdue_invoices() : passe les factures
--    'pending' dont l'échéance est dépassée à l'état 'overdue', chaque nuit.

-- 1) Statut recalculé à l'insertion / modification des conditions d'une facture
CREATE OR REPLACE FUNCTION update_invoice_status_on_invoice()
RETURNS TRIGGER AS $$
DECLARE
  paid NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(payments.amount_paid), 0) INTO paid FROM payments WHERE invoice_id = NEW.id;

  NEW.amount_paid := paid;

  IF paid >= NEW.amount_due THEN
    NEW.status := 'paid';
  ELSIF paid > 0 THEN
    NEW.status := 'partial';
  ELSIF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
    NEW.status := 'overdue';
  ELSE
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_invoice_status_on_invoice ON invoices;

CREATE TRIGGER trg_update_invoice_status_on_invoice
  BEFORE INSERT OR UPDATE OF amount_due, due_date ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_status_on_invoice();

-- 2) Balayage quotidien des factures en retard (pg_cron, 00:30 UTC)
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-overdue-invoices') THEN
    PERFORM cron.unschedule('mark-overdue-invoices');
  END IF;

  PERFORM cron.schedule('mark-overdue-invoices', '30 0 * * *', $$SELECT mark_overdue_invoices()$$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponible : planification de mark_overdue_invoices() non installée (activez l''extension pg_cron dans les réglages Supabase)';
END;
$$;