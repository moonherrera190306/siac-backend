-- Visto bueno de dirección a la asistencia diaria de los maestros.
CREATE TYPE "DictamenDocente" AS ENUM ('ASISTIO', 'RETARDO', 'FALTA', 'JUSTIFICADA');

CREATE TABLE "VistoBuenoDocente" (
    "id" TEXT NOT NULL,
    "horarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "dictamen" "DictamenDocente" NOT NULL,
    "nota" TEXT,
    "validadoPorId" TEXT NOT NULL,
    "validadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VistoBuenoDocente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VistoBuenoDocente_horarioId_fecha_key" ON "VistoBuenoDocente"("horarioId", "fecha");
CREATE INDEX "VistoBuenoDocente_fecha_idx" ON "VistoBuenoDocente"("fecha");

ALTER TABLE "VistoBuenoDocente" ADD CONSTRAINT "VistoBuenoDocente_horarioId_fkey"
  FOREIGN KEY ("horarioId") REFERENCES "Horario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
