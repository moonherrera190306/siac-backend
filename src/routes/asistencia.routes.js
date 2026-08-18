import express from "express";
import prisma from "../lib/prisma.js";

import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/* =========================================
   🧮 HELPERS
========================================= */

/**
 * El sistema anterior guarda la asistencia como acumulado de 4 meses.
 * Esta función dice a qué mes (1-4) pertenece una fecha dentro del ciclo.
 */
function mesDelCiclo(fecha, fechaInicio) {
  if (!fechaInicio) return 1;

  const meses =
    (fecha.getFullYear() - fechaInicio.getFullYear()) * 12 +
    (fecha.getMonth() - fechaInicio.getMonth());

  return Math.min(4, Math.max(1, meses + 1));
}

/**
 * 🔒 Un MAESTRO solo puede tocar sus propias asignaciones.
 */
async function asignacionPropia(user, asignacionId) {
  const asignacion = await prisma.asignacionMateria.findUnique({
    where: { id: asignacionId },
    include: { cicloEscolar: true, grupo: true, materia: true },
  });

  if (!asignacion) return { ok: false, motivo: "Asignación no encontrada" };

  if (user.role === "MAESTRO") {
    const docente = await prisma.docente.findUnique({
      where: { userId: user.id },
    });

    if (!docente || asignacion.docenteId !== docente.id) {
      return { ok: false, motivo: "No tienes asignada esa materia" };
    }
  }

  return { ok: true, asignacion };
}

/**
 * Recalcula el acumulado mensual de un alumno en una materia
 * a partir de la asistencia diaria ya registrada.
 */
async function recalcularMensual(alumnoId, asignacion) {
  const registros = await prisma.asistenciaClase.findMany({
    where: {
      alumnoId,
      clase: { asignacionId: asignacion.id },
    },
    include: { clase: true },
  });

  const acumulado = {
    asisMes1: 0,
    asisMes2: 0,
    asisMes3: 0,
    asisMes4: 0,
    faltasMes1: 0,
    faltasMes2: 0,
    faltasMes3: 0,
    faltasMes4: 0,
  };

  for (const r of registros) {
    const mes = mesDelCiclo(r.clase.fecha, asignacion.cicloEscolar?.fechaInicio);

    // El retardo cuenta como asistencia; el justificado no suma falta.
    if (r.estado === "FALTA") acumulado[`faltasMes${mes}`] += 1;
    else if (r.estado !== "JUSTIFICADO") acumulado[`asisMes${mes}`] += 1;
  }

  const asistidas =
    acumulado.asisMes1 + acumulado.asisMes2 + acumulado.asisMes3 + acumulado.asisMes4;

  const faltas =
    acumulado.faltasMes1 +
    acumulado.faltasMes2 +
    acumulado.faltasMes3 +
    acumulado.faltasMes4;

  const total = asistidas + faltas;

  const porcentaje = total === 0 ? null : Number(((asistidas / total) * 100).toFixed(2));

  await prisma.asistenciaMensual.upsert({
    where: {
      alumnoId_materiaId_cicloEscolarId: {
        alumnoId,
        materiaId: asignacion.materiaId,
        cicloEscolarId: asignacion.cicloEscolarId,
      },
    },
    update: { ...acumulado, porcentaje },
    create: {
      alumnoId,
      materiaId: asignacion.materiaId,
      cicloEscolarId: asignacion.cicloEscolarId,
      ...acumulado,
      porcentaje,
    },
  });
}

/* =========================================
   📋 LISTA PARA PASAR ASISTENCIA
   Devuelve los alumnos del grupo y, si ya se registró
   esa clase, el estado que quedó guardado.
========================================= */
router.get(
  "/clase/:asignacionId",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { asignacionId } = req.params;
      const { fecha } = req.query;

      const permiso = await asignacionPropia(req.user, asignacionId);

      if (!permiso.ok) {
        return res.status(403).json({ success: false, message: permiso.motivo });
      }

      const { asignacion } = permiso;

      const alumnos = await prisma.alumno.findMany({
        where: { grupoId: asignacion.grupoId, activo: true },
        include: { user: true },
        orderBy: { matricula: "asc" },
      });

      let clase = null;

      if (fecha) {
        clase = await prisma.clase.findFirst({
          where: { asignacionId, fecha: new Date(fecha) },
          include: { asistencias: true },
        });
      }

      const data = alumnos.map((a) => ({
        alumnoId: a.id,
        matricula: a.matricula,
        nombre: a.user?.name ?? "",
        estado:
          clase?.asistencias.find((x) => x.alumnoId === a.id)?.estado ?? null,
      }));

      res.json({
        success: true,
        data: {
          asignacion: {
            id: asignacion.id,
            materia: asignacion.materia?.nombre,
            grupo: asignacion.grupo?.nombre,
          },
          clase,
          alumnos: data,
        },
      });
    } catch (error) {
      console.error("🔥 ERROR LISTA ASISTENCIA:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener la lista",
      });
    }
  }
);

/* =========================================
   ✅ REGISTRAR ASISTENCIA + BITÁCORA
   Body: {
     asignacionId, horarioId?, fecha,
     tema, actividad, observaciones, incidencias, evidenciaUrl,
     asistencias: [{ alumnoId, estado, observacion }]
   }
========================================= */
router.post(
  "/clase",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const {
        asignacionId,
        horarioId = null,
        fecha,
        tema,
        actividad,
        observaciones,
        incidencias,
        evidenciaUrl,
        asistencias,
      } = req.body;

      if (!asignacionId || !fecha) {
        return res.status(400).json({
          success: false,
          message: "Asignación y fecha son requeridas",
        });
      }

      if (!Array.isArray(asistencias) || asistencias.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No hay asistencias que registrar",
        });
      }

      const permiso = await asignacionPropia(req.user, asignacionId);

      if (!permiso.ok) {
        return res.status(403).json({ success: false, message: permiso.motivo });
      }

      const { asignacion } = permiso;

      const fechaClase = new Date(fecha);

      const bitacora = {
        tema: tema ?? null,
        actividad: actividad ?? null,
        observaciones: observaciones ?? null,
        incidencias: incidencias ?? null,
        evidenciaUrl: evidenciaUrl ?? null,
        registrada: true,
        registradaEn: new Date(),
        updatedById: req.user.id,
      };

      const clase = await prisma.clase.upsert({
        where: {
          asignacionId_fecha_horarioId: {
            asignacionId,
            fecha: fechaClase,
            horarioId,
          },
        },
        update: bitacora,
        create: {
          asignacionId,
          horarioId,
          fecha: fechaClase,
          createdById: req.user.id,
          ...bitacora,
        },
      });

      // Los alumnos deben pertenecer al grupo de la asignación.
      const delGrupo = await prisma.alumno.findMany({
        where: { grupoId: asignacion.grupoId },
        select: { id: true },
      });

      const permitidos = new Set(delGrupo.map((a) => a.id));

      const operaciones = [];

      for (const a of asistencias) {
        if (!permitidos.has(a.alumnoId)) {
          return res.status(400).json({
            success: false,
            message: "Hay un alumno que no pertenece a este grupo",
          });
        }

        operaciones.push(
          prisma.asistenciaClase.upsert({
            where: {
              claseId_alumnoId: { claseId: clase.id, alumnoId: a.alumnoId },
            },
            update: {
              estado: a.estado,
              observacion: a.observacion ?? null,
            },
            create: {
              claseId: clase.id,
              alumnoId: a.alumnoId,
              estado: a.estado,
              observacion: a.observacion ?? null,
              createdById: req.user.id,
            },
          })
        );
      }

      await prisma.$transaction(operaciones);

      // El acumulado mensual (formato legado) se mantiene al día.
      for (const a of asistencias) {
        await recalcularMensual(a.alumnoId, asignacion);
      }

      res.status(201).json({
        success: true,
        message: "Asistencia registrada correctamente",
        data: clase,
      });
    } catch (error) {
      console.error("🔥 ERROR REGISTRANDO ASISTENCIA:", error);
      res.status(500).json({
        success: false,
        message: "Error al registrar la asistencia",
        error: error.message,
      });
    }
  }
);

/* =========================================
   🗂️ HISTORIAL DE CLASES REGISTRADAS
   Lo que el botón "Ver historial" del maestro nunca tuvo.
========================================= */
router.get(
  "/clases/:asignacionId",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const permiso = await asignacionPropia(req.user, req.params.asignacionId);

      if (!permiso.ok) {
        return res.status(403).json({ success: false, message: permiso.motivo });
      }

      const clases = await prisma.clase.findMany({
        where: { asignacionId: req.params.asignacionId },
        include: {
          horario: true,
          _count: { select: { asistencias: true } },
          asistencias: { select: { estado: true } },
        },
        orderBy: { fecha: "desc" },
        take: 60,
      });

      const data = clases.map((c) => {
        const faltas = c.asistencias.filter((a) => a.estado === "FALTA").length;

        const retardos = c.asistencias.filter(
          (a) => a.estado === "RETARDO"
        ).length;

        return {
          id: c.id,
          fecha: c.fecha,
          registrada: c.registrada,
          tema: c.tema,
          actividad: c.actividad,
          observaciones: c.observaciones,
          incidencias: c.incidencias,
          horario: c.horario
            ? `${c.horario.dia} ${c.horario.horaInicio}-${c.horario.horaFin}`
            : null,
          alumnos: c._count.asistencias,
          faltas,
          retardos,
        };
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error("🔥 ERROR HISTORIAL CLASES:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener el historial de clases",
      });
    }
  }
);

/* =========================================
   📚 ASISTENCIA DE UN ALUMNO
========================================= */
router.get(
  "/alumno/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "ALUMNO", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId } = req.params;

      // 🔒 SEGURIDAD
      if (req.user.role === "ALUMNO" && req.user.alumnoId !== alumnoId) {
        return res.status(403).json({
          success: false,
          message: "No autorizado",
        });
      }

      const alumno = await prisma.alumno.findUnique({
        where: { id: alumnoId },
      });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      const detalle = await prisma.asistenciaClase.findMany({
        where: { alumnoId },
        include: {
          clase: {
            include: {
              asignacion: { include: { materia: true, grupo: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const resumen = await prisma.asistenciaMensual.findMany({
        where: { alumnoId },
        include: { materia: true, cicloEscolar: true },
      });

      res.json({
        success: true,
        data: { detalle, resumen },
      });
    } catch (error) {
      console.error("🔥 ERROR ASISTENCIAS:", error);

      res.status(500).json({
        success: false,
        message: "Error obteniendo asistencias",
        error: error.message,
      });
    }
  }
);

export default router;
