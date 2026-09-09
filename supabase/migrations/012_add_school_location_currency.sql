-- Informations de localisation et de facturation de l'établissement.
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS city VARCHAR,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'MAD';

ALTER TABLE schools
  DROP CONSTRAINT IF EXISTS schools_currency_format_check;

ALTER TABLE schools
  ADD CONSTRAINT schools_currency_format_check
  CHECK (currency ~ '^[A-Z]{3}$');