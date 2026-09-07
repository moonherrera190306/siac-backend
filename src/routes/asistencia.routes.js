import express from "express";
import prisma from "../lib/prisma.js";

import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { puedeRegistrar, TOLERANCIA_MINUTOS } from "../lib/tolerancia.js";

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

      /**
       * ⏱️ TOLERANCIA
       *
       * Para el docente el registro solo vale si lo hace a la hora de su
       * clase: esa es la parte de control de asistencia de la bitácora.
       * Dirección y administración capturan sin restricción, porque son
       * quienes corrigen los casos que el maestro no alcanzó a registrar.
       */
      let horarioResuelto = horarioId;
      let minutosRetardo = null;

      if (req.user.role === "MAESTRO") {
        // Si ya registró esta misma clase, se le permite corregirla el
        // mismo día sin volver a pedir la ventana.
        const yaRegistrada = await prisma.clase.findFirst({
          where: { asignacionId, fecha: fechaClase, registrada: true },
        });

        if (!yaRegistrada) {
          const ventana = await puedeRegistrar({
            asignacionId,
            horarioId,
            fecha: fechaClase,
          });

          if (!ventana.ok) {
            return res.status(403).json({
              success: false,
              message: ventana.motivo,
              toleranciaMinutos: TOLERANCIA_MINUTOS,
            });
          }

          horarioResuelto = ventana.horarioId;
          minutosRetardo = ventana.minutosRetardo;
        } else {
          horarioResuelto = yaRegistrada.horarioId;
          minutosRetardo = yaRegistrada.minutosRetardo;
        }
      }

      const bitacora = {
        minutosRetardo,
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
            horarioId: horarioResuelto ?? null,
          },
        },
        update: bitacora,
        create: {
          asignacionId,
          horarioId: horarioResuelto ?? null,
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
   🔢 CAPTURA DIRECTA POR NÚMERO DE CLASES
   El docente dice cuántas clases dio en el mes y cuántas asistió cada
   alumno; el sistema saca las faltas y el porcentaje. Es el formato que
   ya usaban en papel y no obliga a pasar lista sesión por sesión.
========================================= */

/** Precarga: alumnos del grupo con lo ya capturado en ese mes. */
router.get(
  "/directa/:asignacionId",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const permiso = await asignacionPropia(req.user, req.params.asignacionId);

      if (!permiso.ok) {
        return res.status(403).json({ success: false, message: permiso.motivo });
      }

      const { asignacion } = permiso;

      const mes = Math.min(4, Math.max(1, Number(req.query.mes) || 1));

      const [alumnos, capturado] = await Promise.all([
        prisma.alumno.findMany({
          where: { grupoId: asignacion.grupoId, activo: true },
          include: { user: true },
          orderBy: { matricula: "asc" },
        }),
        prisma.asistenciaMensual.findMany({
          where: {
            materiaId: asignacion.materiaId,
            cicloEscolarId: asignacion.cicloEscolarId,
          },
        }),
      ]);

      const porAlumno = new Map(capturado.map((c) => [c.alumnoId, c]));

      const data = alumnos.map((a) => {
        const c = porAlumno.get(a.id);

        return {
          alumnoId: a.id,
          matricula: a.matricula,
          nombre: a.user?.name ?? "",
          asistencias: c?.[`asisMes${mes}`] ?? 0,
          faltas: c?.[`faltasMes${mes}`] ?? 0,
          porcentaje: c?.porcentaje ?? null,
        };
      });

      // Todas las filas del mes suelen traer el mismo total de clases.
      const clasesImpartidas = data.length
        ? Math.max(...data.map((d) => d.asistencias + d.faltas))
        : 0;

      res.json({
        success: true,
        data: {
          asignacion: {
            id: asignacion.id,
            materia: asignacion.materia?.nombre,
            grupo: asignacion.grupo?.nombre,
          },
          mes,
          clasesImpartidas,
          alumnos: data,
        },
      });
    } catch (error) {
      console.error("🔥 ERROR PRECARGA DIRECTA:", error);

      res.status(500).json({
        success: false,
        message: "Error al cargar la captura mensual",
      });
    }
  }
);

/**
 * Body: {
 *   asignacionId, mes (1-4), clasesImpartidas,
 *   alumnos: [{ alumnoId, asistencias, faltas? }]
 * }
 */
router.post(
  "/directa",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { asignacionId, mes, clasesImpartidas, alumnos } = req.body;

      const numeroMes = Math.min(4, Math.max(1, Number(mes) || 1));

      const totalClases = Number(clasesImpartidas);

      if (!asignacionId || !Number.isFinite(totalClases) || totalClases < 0) {
        return res.status(400).json({
          success: false,
          message: "Indica la asignación y cuántas clases impartiste",
        });
      }

      if (!Array.isArray(alumnos) || alumnos.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No hay alumnos que capturar",
        });
      }

      const permiso = await asignacionPropia(req.user, asignacionId);

      if (!permiso.ok) {
        return res.status(403).json({ success: false, message: permiso.motivo });
      }

      const { asignacion } = permiso;

      const delGrupo = await prisma.alumno.findMany({
        where: { grupoId: asignacion.grupoId },
        select: { id: true },
      });

      const permitidos = new Set(delGrupo.map((a) => a.id));

      const operaciones = [];

      for (const a of alumnos) {
        if (!permitidos.has(a.alumnoId)) {
          return res.status(400).json({
            success: false,
            message: "Hay un alumno que no pertenece a este grupo",
          });
        }

        const asistio = Math.max(0, Math.min(totalClases, Number(a.asistencias) || 0));

        // Las faltas se deducen salvo que el docente las capture aparte.
        const falto =
          a.faltas === undefined || a.faltas === null || a.faltas === ""
            ? totalClases - asistio
            : Math.max(0, Number(a.faltas) || 0);

        const previo = await prisma.asistenciaMensual.findUnique({
          where: {
            alumnoId_materiaId_cicloEscolarId: {
              alumnoId: a.alumnoId,
              materiaId: asignacion.materiaId,
              cicloEscolarId: asignacion.cicloEscolarId,
            },
          },
        });

        const campos = {
          ...(previo ?? {}),
          [`asisMes${numeroMes}`]: asistio,
          [`faltasMes${numeroMes}`]: falto,
        };

        const asistidas =
          (campos.asisMes1 || 0) +
          (campos.asisMes2 || 0) +
          (campos.asisMes3 || 0) +
          (campos.asisMes4 || 0);

        const faltas =
          (campos.faltasMes1 || 0) +
          (campos.faltasMes2 || 0) +
          (campos.faltasMes3 || 0) +
          (campos.faltasMes4 || 0);

        const suma = asistidas + faltas;

        const porcentaje =
          suma === 0 ? null : Number(((asistidas / suma) * 100).toFixed(2));

        const datos = {
          asisMes1: campos.asisMes1 || 0,
          asisMes2: campos.asisMes2 || 0,
          asisMes3: campos.asisMes3 || 0,
          asisMes4: campos.asisMes4 || 0,
          faltasMes1: campos.faltasMes1 || 0,
          faltasMes2: campos.faltasMes2 || 0,
          faltasMes3: campos.faltasMes3 || 0,
          faltasMes4: campos.faltasMes4 || 0,
          porcentaje,
        };

        operaciones.push(
          prisma.asistenciaMensual.upsert({
            where: {
              alumnoId_materiaId_cicloEscolarId: {
                alumnoId: a.alumnoId,
                materiaId: asignacion.materiaId,
                cicloEscolarId: asignacion.cicloEscolarId,
              },
            },
            update: datos,
            create: {
              alumnoId: a.alumnoId,
              materiaId: asignacion.materiaId,
              cicloEscolarId: asignacion.cicloEscolarId,
              ...datos,
            },
          })
        );
      }

      await prisma.$transaction(operaciones);

      res.status(201).json({
        success: true,
        message: `Asistencia del mes ${numeroMes} guardada sobre ${totalClases} clase(s) impartida(s)`,
      });
    } catch (error) {
      console.error("🔥 ERROR CAPTURA DIRECTA:", error);

      res.status(500).json({
        success: false,
        message: "Error al guardar la asistencia por número de clases",
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
