import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { seTraslapan, validarDatos } from "../lib/horarios.js";

const router = express.Router();

/**
 * 🕐 HORARIOS
 *
 * Un Horario es un bloque programado de una asignación:
 * día + hora de inicio + hora de fin + aula.
 *
 * Aquí vive la única validación que evita armar un horario imposible:
 * un grupo no puede tener dos materias a la misma hora, y un docente
 * no puede estar en dos grupos al mismo tiempo.
 */

/**
 * 🔒 Busca choques contra los bloques ya guardados del mismo ciclo.
 * `ignorarId` sirve al editar: el bloque no choca consigo mismo.
 */
async function buscarChoques(asignacion, { dia, horaInicio, horaFin }, ignorarId) {
  const candidatos = await prisma.horario.findMany({
    where: {
      dia,
      id: ignorarId ? { not: ignorarId } : undefined,
      asignacion: {
        cicloEscolarId: asignacion.cicloEscolarId,
        OR: [
          { grupoId: asignacion.grupoId },
          { docenteId: asignacion.docenteId },
        ],
      },
    },
    include: {
      asignacion: {
        include: {
          materia: true,
          grupo: true,
          docente: { include: { user: true } },
        },
      },
    },
  });

  const choques = [];

  for (const c of candidatos) {
    if (!seTraslapan(horaInicio, horaFin, c.horaInicio, c.horaFin)) continue;

    const mismoGrupo = c.asignacion.grupoId === asignacion.grupoId;

    choques.push({
      tipo: mismoGrupo ? "GRUPO" : "DOCENTE",
      mensaje: mismoGrupo
        ? `El grupo ${c.asignacion.grupo?.nombre} ya tiene ${c.asignacion.materia?.nombre} de ${c.horaInicio} a ${c.horaFin}`
        : `El docente ${
            c.asignacion.docente?.nombre || c.asignacion.docente?.user?.name
          } ya está en el grupo ${c.asignacion.grupo?.nombre} de ${c.horaInicio} a ${c.horaFin}`,
    });
  }

  return choques;
}

/* =========================================
   📄 HORARIOS DE UNA ASIGNACIÓN
========================================= */
router.get(
  "/asignacion/:asignacionId",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "MAESTRO"]),
  async (req, res) => {
    try {
      const horarios = await prisma.horario.findMany({
        where: { asignacionId: req.params.asignacionId },
        orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
      });

      res.json({ success: true, data: horarios });
    } catch (error) {
      console.error("ERROR HORARIOS:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener los horarios",
      });
    }
  }
);

/* =========================================
   📄 HORARIO COMPLETO DE UN GRUPO
========================================= */
router.get(
  "/grupo/:grupoId",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "MAESTRO"]),
  async (req, res) => {
    try {
      const horarios = await prisma.horario.findMany({
        where: {
          asignacion: {
            grupoId: req.params.grupoId,
            ...(req.query.cicloEscolarId
              ? { cicloEscolarId: req.query.cicloEscolarId }
              : { cicloEscolar: { activo: true } }),
          },
        },
        include: {
          asignacion: {
            include: {
              materia: true,
              docente: { include: { user: true } },
            },
          },
        },
        orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
      });

      const data = horarios.map((h) => ({
        id: h.id,
        asignacionId: h.asignacionId,
        dia: h.dia,
        horaInicio: h.horaInicio,
        horaFin: h.horaFin,
        aula: h.aula || h.asignacion.aula,
        materia: h.asignacion.materia?.nombre,
        docente:
          h.asignacion.docente?.nombre || h.asignacion.docente?.user?.name,
      }));

      res.json({ success: true, data });
    } catch (error) {
      console.error("ERROR HORARIO GRUPO:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener el horario del grupo",
      });
    }
  }
);

/* =========================================
   ✅ CREAR BLOQUE
========================================= */
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { asignacionId, dia, horaInicio, horaFin, aula } = req.body;

      if (!asignacionId) {
        return res.status(400).json({
          success: false,
          message: "La asignación es requerida",
        });
      }

      const errorDatos = validarDatos({ dia, horaInicio, horaFin });

      if (errorDatos) {
        return res.status(400).json({ success: false, message: errorDatos });
      }

      const asignacion = await prisma.asignacionMateria.findUnique({
        where: { id: asignacionId },
      });

      if (!asignacion) {
        return res.status(404).json({
          success: false,
          message: "Asignación no encontrada",
        });
      }

      const choques = await buscarChoques(asignacion, { dia, horaInicio, horaFin });

      if (choques.length > 0) {
        return res.status(409).json({
          success: false,
          message: choques[0].mensaje,
          data: { choques },
        });
      }

      const horario = await prisma.horario.create({
        data: {
          asignacionId,
          dia,
          horaInicio,
          horaFin,
          aula: aula || null,
        },
      });

      res.status(201).json({ success: true, data: horario });
    } catch (error) {
      console.error(error);

      // El @@unique de (asignacion, dia, horaInicio) puede dispararse.
      if (error.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "Ya existe un bloque de esa materia ese día a esa hora",
        });
      }

      res.status(500).json({
        success: false,
        message: "Error al crear el bloque de horario",
      });
    }
  }
);

/* =========================================
   ✏️ ACTUALIZAR BLOQUE
========================================= */
router.put(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { dia, horaInicio, horaFin, aula } = req.body;

      const actual = await prisma.horario.findUnique({
        where: { id: req.params.id },
        include: { asignacion: true },
      });

      if (!actual) {
        return res.status(404).json({
          success: false,
          message: "Bloque no encontrado",
        });
      }

      const nuevos = {
        dia: dia || actual.dia,
        horaInicio: horaInicio || actual.horaInicio,
        horaFin: horaFin || actual.horaFin,
      };

      const errorDatos = validarDatos(nuevos);

      if (errorDatos) {
        return res.status(400).json({ success: false, message: errorDatos });
      }

      const choques = await buscarChoques(
        actual.asignacion,
        nuevos,
        actual.id
      );

      if (choques.length > 0) {
        return res.status(409).json({
          success: false,
          message: choques[0].mensaje,
          data: { choques },
        });
      }

      const horario = await prisma.horario.update({
        where: { id: actual.id },
        data: {
          ...nuevos,
          aula: aula !== undefined ? aula || null : actual.aula,
        },
      });

      res.json({ success: true, data: horario });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar el bloque",
      });
    }
  }
);

/* =========================================
   🗑️ ELIMINAR BLOQUE
========================================= */
router.delete(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      // 🔒 Si ya hay clases registradas contra ese bloque no se borra:
      // se perdería la trazabilidad de la asistencia.
      const clases = await prisma.clase.count({
        where: { horarioId: req.params.id },
      });

      if (clases > 0) {
        return res.status(400).json({
          success: false,
          message: `No se puede eliminar: ya hay ${clases} clase(s) registrada(s) en ese bloque`,
        });
      }

      await prisma.horario.delete({ where: { id: req.params.id } });

      res.json({ success: true, message: "Bloque eliminado" });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al eliminar el bloque",
      });
    }
  }
);

export default router;
