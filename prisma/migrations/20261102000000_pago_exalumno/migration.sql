-- Cobros a exalumnos del Archivo histórico (biblioteca-siac).
ALTER TABLE "Pago" ALTER COLUMN "alumnoId" DROP NOT NULL;

ALTER TABLE "Pago" ADD COLUMN "exalumnoArchivoId" INTEGER;
ALTER TABLE "Pago" ADD COLUMN "exalumnoMatricula" TEXT;
ALTER TABLE "Pago" ADD COLUMN "exalumnoNombre" TEXT;

-- Todo recibo pertenece a alguien: alumno activo o exalumno.
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_alumno_o_exalumno_check"
  CHECK ("alumnoId" IS NOT NULL OR "exalumnoArchivoId" IS NOT NULL);

CREATE INDEX "Pago_exalumnoArchivoId_idx" ON "Pago"("exalumnoArchivoId");
