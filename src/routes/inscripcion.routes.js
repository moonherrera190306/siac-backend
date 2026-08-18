import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { auditar } from "../lib/audit.js";

const router = express.Router();

/**
 * 📋 INSCRIPCIONES
 *
 * `Alumno.grupoId` es el grupo VIGENTE; `Inscripcion` es el HISTORIAL.
 * Los dos se escriben siempre en la misma transacción: si se separan,
 * el sistema empieza a mentir sobre dónde está cada alumno.
 */

async function cicloActivo() {
  return prisma.cicloEscolar.findFirst({ where: { activo: true } });
}

/* =========================================
   📄 INSCRIPCIONES DE UN CICLO
========================================= */
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(200, Number(req.query.perPage) || 50);

      let { cicloEscolarId } = req.query;

      if (!cicloEscolarId) {
        const activo = await cicloActivo();
        cicloEscolarId = activo?.id;
      }

      const where = {
        ...(cicloEscolarId ? { cicloEscolarId } : {}),
        ...(req.query.grupoId ? { grupoId: req.query.grupoId } : {}),
        ...(req.query.estatus ? { estatus: req.query.estatus } : {}),
      };

      const [inscripciones, total] = await Promise.all([
        prisma.inscripcion.findMany({
          where,
          include: {
            alumno: { include: { user: true, carrera: true } },
            grupo: true,
            cicloEscolar: true,
          },
          orderBy: { fechaInscripcion: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.inscripcion.count({ where }),
      ]);

      res.json({
        success: true,
        data: inscripciones,
        meta: { page, perPage, total, cicloEscolarId },
      });
    } catch (error) {
      console.error("ERROR INSCRIPCIONES:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener las inscripciones",
      });
    }
  }
);

/* =========================================
   📄 HISTORIAL DE UN ALUMNO
========================================= */
router.get(
  "/alumno/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "ALUMNO"]),
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

      const historial = await prisma.inscripcion.findMany({
        where: { alumnoId },
        include: { grupo: true, cicloEscolar: true },
        orderBy: { fechaInscripcion: "desc" },
      });

      res.json({ success: true, data: historial });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener el historial",
      });
    }
  }
);

/* =========================================
   ✅ INSCRIBIR / REINSCRIBIR
========================================= */
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId, grupoId, semestreNumero, observaciones } = req.body;

      let { cicloEscolarId } = req.body;

      if (!alumnoId) {
        return res.status(400).json({
          success: false,
          message: "El alumno es requerido",
        });
      }

      if (!cicloEscolarId) {
        const activo = await cicloActivo();

        if (!activo) {
          return res.status(400).json({
            success: false,
            message: "No hay un ciclo escolar activo",
          });
        }

        cicloEscolarId = activo.id;
      }

      const alumno = await prisma.alumno.findUnique({ where: { id: alumnoId } });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      const yaInscrito = await prisma.inscripcion.findUnique({
        where: {
          alumnoId_cicloEscolarId: { alumnoId, cicloEscolarId },
        },
      });

      if (yaInscrito) {
        return res.status(400).json({
          success: false,
          message: "El alumno ya está inscrito en ese ciclo",
        });
      }

      if (grupoId) {
        const grupo = await prisma.grupo.findUnique({
          where: { id: grupoId },
          include: { _count: { select: { alumnos: true } } },
        });

        if (!grupo) {
          return res.status(404).json({
            success: false,
            message: "Grupo no encontrado",
          });
        }

        // 🔒 El cupo existe para respetarse.
        if (grupo.cupo && grupo._count.alumnos >= grupo.cupo) {
          return res.status(400).json({
            success: false,
            message: `El grupo ${grupo.nombre} ya alcanzó su cupo (${grupo.cupo})`,
          });
        }
      }

      // 🔥 Historial y grupo vigente en la misma transacción.
      const inscripcion = await prisma.$transaction(async (tx) => {
        const creada = await tx.inscripcion.create({
          data: {
            alumnoId,
            cicloEscolarId,
            grupoId: grupoId || null,
            semestreNumero: semestreNumero ? Number(semestreNumero) : null,
            observaciones: observaciones || null,
            createdById: req.user.id,
          },
          include: { grupo: true, cicloEscolar: true },
        });

        await tx.alumno.update({
          where: { id: alumnoId },
          data: {
            grupoId: grupoId || null,
            estatusAcademico: "ACTIVO",
            activo: true,
          },
        });

        return creada;
      });

      res.status(201).json({ success: true, data: inscripcion });
    } catch (error) {
      console.error(error);

      if (error.code === "P2002") {
        return res.status(400).json({
          success: false,
          message: "El alumno ya está inscrito en ese ciclo",
        });
      }

      res.status(500).json({
        success: false,
        message: "Error al inscribir al alumno",
      });
    }
  }
);

/* =========================================
   🔄 CAMBIAR DE GRUPO
========================================= */
router.put(
  "/:id/grupo",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { grupoId } = req.body;

      if (!grupoId) {
        return res.status(400).json({
          success: false,
          message: "El grupo es requerido",
        });
      }

      const inscripcion = await prisma.inscripcion.findUnique({
        where: { id: req.params.id },
        include: { cicloEscolar: true },
      });

      if (!inscripcion) {
        return res.status(404).json({
          success: false,
          message: "Inscripción no encontrada",
        });
      }

      if (inscripcion.estatus !== "ACTIVA") {
        return res.status(400).json({
          success: false,
          message: "Solo se puede cambiar de grupo en una inscripción activa",
        });
      }

      const grupo = await prisma.grupo.findUnique({
        where: { id: grupoId },
        include: { _count: { select: { alumnos: true } } },
      });

      if (!grupo) {
        return res.status(404).json({
          success: false,
          message: "Grupo no encontrado",
        });
      }

      if (grupo.cupo && grupo._count.alumnos >= grupo.cupo) {
        return res.status(400).json({
          success: false,
          message: `El grupo ${grupo.nombre} ya alcanzó su cupo (${grupo.cupo})`,
        });
      }

      const actualizada = await prisma.$transaction(async (tx) => {
        const ins = await tx.inscripcion.update({
          where: { id: inscripcion.id },
          data: { grupoId, updatedById: req.user.id },
          include: { grupo: true, cicloEscolar: true },
        });

        // El grupo vigente solo se mueve si la inscripción es del ciclo activo.
        if (inscripcion.cicloEscolar?.activo) {
          await tx.alumno.update({
            where: { id: inscripcion.alumnoId },
            data: { grupoId },
          });
        }

        return ins;
      });

      res.json({ success: true, data: actualizada });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al cambiar de grupo",
      });
    }
  }
);

/* =========================================
   🚫 DAR DE BAJA UNA INSCRIPCIÓN
   Nunca se borra: se marca de baja con motivo.
========================================= */
router.put(
  "/:id/baja",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { motivo, definitiva } = req.body;

      if (!motivo) {
        return res.status(400).json({
          success: false,
          message: "El motivo de la baja es obligatorio",
        });
      }

      const inscripcion = await prisma.inscripcion.findUnique({
        where: { id: req.params.id },
        include: { cicloEscolar: true },
      });

      if (!inscripcion) {
        return res.status(404).json({
          success: false,
          message: "Inscripción no encontrada",
        });
      }

      const resultado = await prisma.$transaction(async (tx) => {
        const ins = await tx.inscripcion.update({
          where: { id: inscripcion.id },
          data: {
            estatus: "BAJA",
            fechaBaja: new Date(),
            motivoBaja: motivo,
            updatedById: req.user.id,
          },
        });

        if (inscripcion.cicloEscolar?.activo) {
          await tx.alumno.update({
            where: { id: inscripcion.alumnoId },
            data: {
              grupoId: null,
              estatusAcademico: definitiva ? "BAJA_DEFINITIVA" : "BAJA_TEMPORAL",
              fechaBaja: new Date(),
              motivoBaja: motivo,
            },
          });
        }

        return ins;
      });

      await auditar({
        req,
        accion: "CANCELAR",
        entidad: "Inscripcion",
        entidadId: resultado.id,
        antes: { estatus: inscripcion.estatus, grupoId: inscripcion.grupoId },
        despues: { estatus: "BAJA", motivo },
      });

      res.json({ success: true, data: resultado });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al dar de baja la inscripción",
      });
    }
  }
);

export default router;
