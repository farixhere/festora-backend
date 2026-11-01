-- Complete candidate and team fields used by the live festival reducer.
ALTER TABLE festival_teams ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS chest_number integer;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS candidates_festival_chest_number_unique
  ON candidates(festival_id,chest_number) WHERE chest_number IS NOT NULL;
