-- 🧾 CAJA: libro físico e iniciales de quien cobró
ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "libro" TEXT;
ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "iniciales" TEXT;

CREATE INDEX IF NOT EXISTS "Pago_libro_idx" ON "Pago"("libro");

-- ⏱️ BITÁCORA DOCENTE: minutos de retardo al registrar la clase
ALTER TABLE "Clase" ADD COLUMN IF NOT EXISTS "minutosRetardo" INTEGER;
