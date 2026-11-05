-- Dirección y Secretaría limitadas a un nivel (vacío = ambos).
-- Idempotente: se puede aplicar aunque ya exista la columna.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nivelAcademicoId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_nivelAcademicoId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_nivelAcademicoId_fkey"
      FOREIGN KEY ("nivelAcademicoId") REFERENCES "NivelAcademico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
