-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ALUMNO', 'CAJA', 'DIRECTOR', 'MAESTRO', 'SECRETARIA');

-- CreateEnum
CREATE TYPE "EstatusInscripcion" AS ENUM ('ACTIVA', 'BAJA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "EstatusAcademico" AS ENUM ('ACTIVO', 'BAJA_TEMPORAL', 'BAJA_DEFINITIVA', 'EGRESADO');

-- CreateEnum
CREATE TYPE "TipoEvaluacion" AS ENUM ('NUMERICA', 'ACREDITACION');

-- CreateEnum
CREATE TYPE "TipoMateria" AS ENUM ('OBLIGATORIA', 'COMPLEMENTARIA', 'EXTRACURRICULAR');

-- CreateEnum
CREATE TYPE "ColumnaKardex" AS ENUM ('PP', 'SP', 'PROM', 'EF', 'O', 'EE', 'EA', 'EER', 'ND');

-- CreateEnum
CREATE TYPE "EstatusCalificacion" AS ENUM ('EN_CURSO', 'APROBADA', 'REPROBADA', 'NO_PRESENTO');

-- CreateEnum
CREATE TYPE "EstadoAsistencia" AS ENUM ('PRESENTE', 'FALTA', 'RETARDO', 'JUSTIFICADO');

-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO');

-- CreateEnum
CREATE TYPE "EstadoDocumento" AS ENUM ('PENDIENTE', 'VALIDADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'DEPOSITO');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('PAGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoTramite" AS ENUM ('SOLICITADO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoObservacion" AS ENUM ('ACADEMICA', 'CONDUCTA', 'ASISTENCIA', 'ADMINISTRATIVA', 'RECONOCIMIENTO', 'OTRA');

-- CreateEnum
CREATE TYPE "GravedadObservacion" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "EstatusObservacion" AS ENUM ('ABIERTA', 'EN_SEGUIMIENTO', 'RESUELTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "AccionAudit" AS ENUM ('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'CANCELAR', 'LOGIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcceso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alumno" (
    "id" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "legacyId" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "curp" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "foto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "grupoId" TEXT,
    "programaId" TEXT,
    "carreraId" TEXT,
    "trayectoriaId" TEXT,
    "sexo" TEXT,
    "ciudad" TEXT,
    "estado" TEXT,
    "codigoPostal" TEXT,
    "tutorNombre" TEXT,
    "tutorTelefono" TEXT,
    "estatusAcademico" "EstatusAcademico" NOT NULL DEFAULT 'ACTIVO',
    "fechaBaja" TIMESTAMP(3),
    "motivoBaja" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alumno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Docente" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "nombre" TEXT,
    "cedula" TEXT,
    "rfc" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Docente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NivelAcademico" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NivelAcademico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turno" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Programa" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "nombre" TEXT NOT NULL,
    "nivelAcademicoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Programa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrera" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "nombre" TEXT NOT NULL,
    "totalSemestres" INTEGER NOT NULL,
    "programaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Carrera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trayectoria" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "seccion" TEXT,
    "nivelAcademicoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trayectoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semestre" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "nombre" TEXT NOT NULL,
    "numero" INTEGER,
    "carreraId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Semestre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "nombre" TEXT NOT NULL,
    "turnoId" TEXT,
    "semestreId" TEXT,
    "cupo" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Materia" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "clave" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "TipoMateria" NOT NULL DEFAULT 'OBLIGATORIA',
    "tipoEvaluacion" "TipoEvaluacion" NOT NULL DEFAULT 'NUMERICA',
    "creditos" INTEGER,
    "horasSemana" INTEGER,
    "semestreId" TEXT,
    "trayectoriaId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Materia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionMateria" (
    "id" TEXT NOT NULL,
    "materiaId" TEXT NOT NULL,
    "docenteId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "cicloEscolarId" TEXT NOT NULL,
    "aula" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsignacionMateria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CicloEscolar" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CicloEscolar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inscripcion" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "alumnoId" TEXT NOT NULL,
    "cicloEscolarId" TEXT NOT NULL,
    "grupoId" TEXT,
    "semestreNumero" INTEGER,
    "estatus" "EstatusInscripcion" NOT NULL DEFAULT 'ACTIVA',
    "fechaInscripcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaBaja" TIMESTAMP(3),
    "motivoBaja" TEXT,
    "observaciones" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Horario" (
    "id" TEXT NOT NULL,
    "asignacionId" TEXT NOT NULL,
    "dia" "DiaSemana" NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "aula" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Horario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clase" (
    "id" TEXT NOT NULL,
    "asignacionId" TEXT NOT NULL,
    "horarioId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "registrada" BOOLEAN NOT NULL DEFAULT false,
    "registradaEn" TIMESTAMP(3),
    "tema" TEXT,
    "actividad" TEXT,
    "observaciones" TEXT,
    "incidencias" TEXT,
    "evidenciaUrl" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsistenciaClase" (
    "id" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "estado" "EstadoAsistencia" NOT NULL,
    "observacion" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsistenciaClase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsistenciaMensual" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "alumnoId" TEXT NOT NULL,
    "materiaId" TEXT NOT NULL,
    "cicloEscolarId" TEXT NOT NULL,
    "asisMes1" INTEGER NOT NULL DEFAULT 0,
    "asisMes2" INTEGER NOT NULL DEFAULT 0,
    "asisMes3" INTEGER NOT NULL DEFAULT 0,
    "asisMes4" INTEGER NOT NULL DEFAULT 0,
    "faltasMes1" INTEGER NOT NULL DEFAULT 0,
    "faltasMes2" INTEGER NOT NULL DEFAULT 0,
    "faltasMes3" INTEGER NOT NULL DEFAULT 0,
    "faltasMes4" INTEGER NOT NULL DEFAULT 0,
    "porcentaje" DOUBLE PRECISION,
    "migrado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsistenciaMensual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calificacion" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "alumnoId" TEXT NOT NULL,
    "materiaId" TEXT NOT NULL,
    "cicloEscolarId" TEXT NOT NULL,
    "primerParcial" VARCHAR(4),
    "segundoParcial" VARCHAR(4),
    "promedio" VARCHAR(4),
    "examenFinal" VARCHAR(4),
    "notaFinal" VARCHAR(4),
    "extraordinario" VARCHAR(4),
    "adicional" VARCHAR(4),
    "especial" VARCHAR(4),
    "articulo" VARCHAR(8),
    "notaDefinitiva" VARCHAR(4),
    "estatus" "EstatusCalificacion" NOT NULL DEFAULT 'EN_CURSO',
    "migrado" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bloqueo" (
    "id" TEXT NOT NULL,
    "cicloEscolarId" TEXT NOT NULL,
    "columna" "ColumnaKardex" NOT NULL,
    "abierto" BOOLEAN NOT NULL DEFAULT false,
    "fechaApertura" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bloqueo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT,
    "tamano" INTEGER,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" TEXT,
    "validadoPorId" TEXT,
    "validadoEn" TIMESTAMP(3),
    "alumnoId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptoPago" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "monto" DOUBLE PRECISION,
    "generaTramite" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptoPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "metodo" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
    "referencia" TEXT,
    "estado" "EstadoPago" NOT NULL DEFAULT 'PAGADO',
    "pagadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladoEn" TIMESTAMP(3),
    "canceladoPorId" TEXT,
    "motivoCancela" TEXT,
    "cobradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetallePago" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "conceptoPagoId" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "monto" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DetallePago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adeudo" (
    "id" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "conceptoPagoId" TEXT,
    "cicloEscolarId" TEXT,
    "descripcion" TEXT,
    "monto" DOUBLE PRECISION NOT NULL,
    "saldo" DOUBLE PRECISION NOT NULL,
    "fechaLimite" TIMESTAMP(3),
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Adeudo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tramite" (
    "id" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "conceptoPagoId" TEXT,
    "pagoId" TEXT,
    "estado" "EstadoTramite" NOT NULL DEFAULT 'SOLICITADO',
    "notas" TEXT,
    "atendidoPorId" TEXT,
    "atendidoEn" TIMESTAMP(3),
    "entregadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tramite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observacion" (
    "id" TEXT NOT NULL,
    "tipo" "TipoObservacion" NOT NULL DEFAULT 'OTRA',
    "gravedad" "GravedadObservacion" NOT NULL DEFAULT 'MEDIA',
    "estatus" "EstatusObservacion" NOT NULL DEFAULT 'ABIERTA',
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "alumnoId" TEXT,
    "docenteId" TEXT,
    "grupoId" TEXT,
    "materiaId" TEXT,
    "claseId" TEXT,
    "evidenciaUrl" TEXT,
    "resueltaEn" TIMESTAMP(3),
    "resolucion" TEXT,
    "resueltaPorId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Observacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservacionSeguimiento" (
    "id" TEXT NOT NULL,
    "observacionId" TEXT NOT NULL,
    "nota" TEXT NOT NULL,
    "estatusNuevo" "EstatusObservacion",
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservacionSeguimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" "AccionAudit" NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "valorAnterior" JSONB,
    "valorNuevo" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Alumno_matricula_key" ON "Alumno"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "Alumno_legacyId_key" ON "Alumno"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Alumno_userId_key" ON "Alumno"("userId");

-- CreateIndex
CREATE INDEX "Alumno_grupoId_idx" ON "Alumno"("grupoId");

-- CreateIndex
CREATE INDEX "Alumno_programaId_idx" ON "Alumno"("programaId");

-- CreateIndex
CREATE INDEX "Alumno_carreraId_idx" ON "Alumno"("carreraId");

-- CreateIndex
CREATE INDEX "Alumno_estatusAcademico_idx" ON "Alumno"("estatusAcademico");

-- CreateIndex
CREATE UNIQUE INDEX "Docente_legacyId_key" ON "Docente"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Docente_userId_key" ON "Docente"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NivelAcademico_legacyId_key" ON "NivelAcademico"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "NivelAcademico_clave_key" ON "NivelAcademico"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "Turno_legacyId_key" ON "Turno"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Turno_clave_key" ON "Turno"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "Programa_legacyId_key" ON "Programa"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Programa_nombre_key" ON "Programa"("nombre");

-- CreateIndex
CREATE INDEX "Programa_nivelAcademicoId_idx" ON "Programa"("nivelAcademicoId");

-- CreateIndex
CREATE UNIQUE INDEX "Carrera_legacyId_key" ON "Carrera"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Carrera_nombre_key" ON "Carrera"("nombre");

-- CreateIndex
CREATE INDEX "Carrera_programaId_idx" ON "Carrera"("programaId");

-- CreateIndex
CREATE UNIQUE INDEX "Trayectoria_legacyId_key" ON "Trayectoria"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Trayectoria_clave_key" ON "Trayectoria"("clave");

-- CreateIndex
CREATE INDEX "Trayectoria_nivelAcademicoId_idx" ON "Trayectoria"("nivelAcademicoId");

-- CreateIndex
CREATE UNIQUE INDEX "Semestre_legacyId_key" ON "Semestre"("legacyId");

-- CreateIndex
CREATE INDEX "Semestre_carreraId_idx" ON "Semestre"("carreraId");

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_legacyId_key" ON "Grupo"("legacyId");

-- CreateIndex
CREATE INDEX "Grupo_semestreId_idx" ON "Grupo"("semestreId");

-- CreateIndex
CREATE INDEX "Grupo_turnoId_idx" ON "Grupo"("turnoId");

-- CreateIndex
CREATE UNIQUE INDEX "Materia_legacyId_key" ON "Materia"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Materia_clave_key" ON "Materia"("clave");

-- CreateIndex
CREATE INDEX "Materia_semestreId_idx" ON "Materia"("semestreId");

-- CreateIndex
CREATE INDEX "Materia_trayectoriaId_idx" ON "Materia"("trayectoriaId");

-- CreateIndex
CREATE INDEX "Materia_tipo_idx" ON "Materia"("tipo");

-- CreateIndex
CREATE INDEX "AsignacionMateria_docenteId_idx" ON "AsignacionMateria"("docenteId");

-- CreateIndex
CREATE INDEX "AsignacionMateria_grupoId_idx" ON "AsignacionMateria"("grupoId");

-- CreateIndex
CREATE INDEX "AsignacionMateria_cicloEscolarId_idx" ON "AsignacionMateria"("cicloEscolarId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionMateria_materiaId_grupoId_cicloEscolarId_key" ON "AsignacionMateria"("materiaId", "grupoId", "cicloEscolarId");

-- CreateIndex
CREATE UNIQUE INDEX "CicloEscolar_legacyId_key" ON "CicloEscolar"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "CicloEscolar_nombre_key" ON "CicloEscolar"("nombre");

-- CreateIndex
CREATE INDEX "CicloEscolar_activo_idx" ON "CicloEscolar"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "Inscripcion_legacyId_key" ON "Inscripcion"("legacyId");

-- CreateIndex
CREATE INDEX "Inscripcion_cicloEscolarId_idx" ON "Inscripcion"("cicloEscolarId");

-- CreateIndex
CREATE INDEX "Inscripcion_grupoId_idx" ON "Inscripcion"("grupoId");

-- CreateIndex
CREATE INDEX "Inscripcion_estatus_idx" ON "Inscripcion"("estatus");

-- CreateIndex
CREATE UNIQUE INDEX "Inscripcion_alumnoId_cicloEscolarId_key" ON "Inscripcion"("alumnoId", "cicloEscolarId");

-- CreateIndex
CREATE INDEX "Horario_asignacionId_idx" ON "Horario"("asignacionId");

-- CreateIndex
CREATE INDEX "Horario_dia_idx" ON "Horario"("dia");

-- CreateIndex
CREATE UNIQUE INDEX "Horario_asignacionId_dia_horaInicio_key" ON "Horario"("asignacionId", "dia", "horaInicio");

-- CreateIndex
CREATE INDEX "Clase_asignacionId_idx" ON "Clase"("asignacionId");

-- CreateIndex
CREATE INDEX "Clase_fecha_idx" ON "Clase"("fecha");

-- CreateIndex
CREATE INDEX "Clase_registrada_idx" ON "Clase"("registrada");

-- CreateIndex
CREATE UNIQUE INDEX "Clase_asignacionId_fecha_horarioId_key" ON "Clase"("asignacionId", "fecha", "horarioId");

-- CreateIndex
CREATE INDEX "AsistenciaClase_alumnoId_idx" ON "AsistenciaClase"("alumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaClase_claseId_alumnoId_key" ON "AsistenciaClase"("claseId", "alumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaMensual_legacyId_key" ON "AsistenciaMensual"("legacyId");

-- CreateIndex
CREATE INDEX "AsistenciaMensual_materiaId_idx" ON "AsistenciaMensual"("materiaId");

-- CreateIndex
CREATE INDEX "AsistenciaMensual_cicloEscolarId_idx" ON "AsistenciaMensual"("cicloEscolarId");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaMensual_alumnoId_materiaId_cicloEscolarId_key" ON "AsistenciaMensual"("alumnoId", "materiaId", "cicloEscolarId");

-- CreateIndex
CREATE UNIQUE INDEX "Calificacion_legacyId_key" ON "Calificacion"("legacyId");

-- CreateIndex
CREATE INDEX "Calificacion_materiaId_idx" ON "Calificacion"("materiaId");

-- CreateIndex
CREATE INDEX "Calificacion_cicloEscolarId_idx" ON "Calificacion"("cicloEscolarId");

-- CreateIndex
CREATE INDEX "Calificacion_estatus_idx" ON "Calificacion"("estatus");

-- CreateIndex
CREATE UNIQUE INDEX "Calificacion_alumnoId_materiaId_cicloEscolarId_key" ON "Calificacion"("alumnoId", "materiaId", "cicloEscolarId");

-- CreateIndex
CREATE UNIQUE INDEX "Bloqueo_cicloEscolarId_columna_key" ON "Bloqueo"("cicloEscolarId", "columna");

-- CreateIndex
CREATE INDEX "Documento_alumnoId_idx" ON "Documento"("alumnoId");

-- CreateIndex
CREATE INDEX "Documento_estado_idx" ON "Documento"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptoPago_legacyId_key" ON "ConceptoPago"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptoPago_clave_key" ON "ConceptoPago"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_folio_key" ON "Pago"("folio");

-- CreateIndex
CREATE INDEX "Pago_alumnoId_idx" ON "Pago"("alumnoId");

-- CreateIndex
CREATE INDEX "Pago_pagadoEn_idx" ON "Pago"("pagadoEn");

-- CreateIndex
CREATE INDEX "Pago_estado_idx" ON "Pago"("estado");

-- CreateIndex
CREATE INDEX "Pago_cobradoPorId_idx" ON "Pago"("cobradoPorId");

-- CreateIndex
CREATE INDEX "DetallePago_pagoId_idx" ON "DetallePago"("pagoId");

-- CreateIndex
CREATE INDEX "DetallePago_conceptoPagoId_idx" ON "DetallePago"("conceptoPagoId");

-- CreateIndex
CREATE INDEX "Adeudo_alumnoId_idx" ON "Adeudo"("alumnoId");

-- CreateIndex
CREATE INDEX "Adeudo_pagado_idx" ON "Adeudo"("pagado");

-- CreateIndex
CREATE INDEX "Tramite_alumnoId_idx" ON "Tramite"("alumnoId");

-- CreateIndex
CREATE INDEX "Tramite_estado_idx" ON "Tramite"("estado");

-- CreateIndex
CREATE INDEX "Observacion_alumnoId_idx" ON "Observacion"("alumnoId");

-- CreateIndex
CREATE INDEX "Observacion_docenteId_idx" ON "Observacion"("docenteId");

-- CreateIndex
CREATE INDEX "Observacion_grupoId_idx" ON "Observacion"("grupoId");

-- CreateIndex
CREATE INDEX "Observacion_estatus_idx" ON "Observacion"("estatus");

-- CreateIndex
CREATE INDEX "Observacion_tipo_idx" ON "Observacion"("tipo");

-- CreateIndex
CREATE INDEX "Observacion_createdAt_idx" ON "Observacion"("createdAt");

-- CreateIndex
CREATE INDEX "ObservacionSeguimiento_observacionId_idx" ON "ObservacionSeguimiento"("observacionId");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_usuarioId_idx" ON "AuditLog"("usuarioId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "Carrera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_trayectoriaId_fkey" FOREIGN KEY ("trayectoriaId") REFERENCES "Trayectoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Docente" ADD CONSTRAINT "Docente_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programa" ADD CONSTRAINT "Programa_nivelAcademicoId_fkey" FOREIGN KEY ("nivelAcademicoId") REFERENCES "NivelAcademico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carrera" ADD CONSTRAINT "Carrera_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trayectoria" ADD CONSTRAINT "Trayectoria_nivelAcademicoId_fkey" FOREIGN KEY ("nivelAcademicoId") REFERENCES "NivelAcademico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semestre" ADD CONSTRAINT "Semestre_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "Carrera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grupo" ADD CONSTRAINT "Grupo_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grupo" ADD CONSTRAINT "Grupo_semestreId_fkey" FOREIGN KEY ("semestreId") REFERENCES "Semestre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Materia" ADD CONSTRAINT "Materia_semestreId_fkey" FOREIGN KEY ("semestreId") REFERENCES "Semestre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Materia" ADD CONSTRAINT "Materia_trayectoriaId_fkey" FOREIGN KEY ("trayectoriaId") REFERENCES "Trayectoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionMateria" ADD CONSTRAINT "AsignacionMateria_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionMateria" ADD CONSTRAINT "AsignacionMateria_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionMateria" ADD CONSTRAINT "AsignacionMateria_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionMateria" ADD CONSTRAINT "AsignacionMateria_cicloEscolarId_fkey" FOREIGN KEY ("cicloEscolarId") REFERENCES "CicloEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_cicloEscolarId_fkey" FOREIGN KEY ("cicloEscolarId") REFERENCES "CicloEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Horario" ADD CONSTRAINT "Horario_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "AsignacionMateria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clase" ADD CONSTRAINT "Clase_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "AsignacionMateria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clase" ADD CONSTRAINT "Clase_horarioId_fkey" FOREIGN KEY ("horarioId") REFERENCES "Horario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaClase" ADD CONSTRAINT "AsistenciaClase_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaClase" ADD CONSTRAINT "AsistenciaClase_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaMensual" ADD CONSTRAINT "AsistenciaMensual_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaMensual" ADD CONSTRAINT "AsistenciaMensual_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaMensual" ADD CONSTRAINT "AsistenciaMensual_cicloEscolarId_fkey" FOREIGN KEY ("cicloEscolarId") REFERENCES "CicloEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calificacion" ADD CONSTRAINT "Calificacion_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calificacion" ADD CONSTRAINT "Calificacion_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calificacion" ADD CONSTRAINT "Calificacion_cicloEscolarId_fkey" FOREIGN KEY ("cicloEscolarId") REFERENCES "CicloEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueo" ADD CONSTRAINT "Bloqueo_cicloEscolarId_fkey" FOREIGN KEY ("cicloEscolarId") REFERENCES "CicloEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetallePago" ADD CONSTRAINT "DetallePago_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetallePago" ADD CONSTRAINT "DetallePago_conceptoPagoId_fkey" FOREIGN KEY ("conceptoPagoId") REFERENCES "ConceptoPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adeudo" ADD CONSTRAINT "Adeudo_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adeudo" ADD CONSTRAINT "Adeudo_conceptoPagoId_fkey" FOREIGN KEY ("conceptoPagoId") REFERENCES "ConceptoPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adeudo" ADD CONSTRAINT "Adeudo_cicloEscolarId_fkey" FOREIGN KEY ("cicloEscolarId") REFERENCES "CicloEscolar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tramite" ADD CONSTRAINT "Tramite_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tramite" ADD CONSTRAINT "Tramite_conceptoPagoId_fkey" FOREIGN KEY ("conceptoPagoId") REFERENCES "ConceptoPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tramite" ADD CONSTRAINT "Tramite_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacion" ADD CONSTRAINT "Observacion_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacion" ADD CONSTRAINT "Observacion_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacion" ADD CONSTRAINT "Observacion_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacion" ADD CONSTRAINT "Observacion_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacion" ADD CONSTRAINT "Observacion_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservacionSeguimiento" ADD CONSTRAINT "ObservacionSeguimiento_observacionId_fkey" FOREIGN KEY ("observacionId") REFERENCES "Observacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
