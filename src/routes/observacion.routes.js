import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/**
 * 📌 OBSERVACIONES CON SEGUIMIENTO
 *
 * Una observación no es un comentario: tiene tipo, gravedad, estatus,
 * a quién se refiere, quién la registró y una bitácora de avance.
 */

const ESTATUS_ABIERTOS = ["ABIERTA", "EN_SEGUIMIENTO"];

const INCLUDE = {
  alumno: { include: { user: true, grupo: true } },
  docente: { include: { user: true } },
  grupo: true,
  materia: true,
  clase: { select: { id: true, fecha: true, tema: true } },
  seguimientos: { orderBy: { createdAt: "asc" } },
};

/* =========================================
   📄 LISTA
========================================= */
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "MAESTRO"]),
  async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(200, Number(req.query.perPage) || 50);

      const where = {
        ...(req.query.estatus ? { estatus: req.query.estatus } : {}),
        ...(req.query.tipo ? { tipo: req.query.tipo } : {}),
        ...(req.query.gravedad ? { gravedad: req.query.gravedad } : {}),
        ...(req.query.alumnoId ? { alumnoId: req.query.alumnoId } : {}),
        ...(req.query.docenteId ? { docenteId: req.query.docenteId } : {}),
        ...(req.query.grupoId ? { grupoId: req.query.grupoId } : {}),
        ...(req.query.abiertas === "true"
          ? { estatus: { in: ESTATUS_ABIERTOS } }
          : {}),
      };

      // 🔒 Un MAESTRO solo ve las que él registró.
      // Las observaciones sobre su desempeño son de dirección.
      if (req.user.role === "MAESTRO") {
        where.createdById = req.user.id;
      }

      const [observaciones, total, abiertas] = await Promise.all([
        prisma.observacion.findMany({
          where,
          include: INCLUDE,
          orderBy: [{ gravedad: "desc" }, { createdAt: "desc" }],
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.observacion.count({ where }),
        prisma.observacion.count({
          where: { ...where, estatus: { in: ESTATUS_ABIERTOS } },
        }),
      ]);

      res.json({
        success: true,
        data: observaciones,
        meta: { page, perPage, total, abiertas },
      });
    } catch (error) {
      console.error("ERROR OBSERVACIONES:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener las observaciones",
      });
    }
  }
);

/* =========================================
   📄 UNA OBSERVACIÓN
========================================= */
router.get(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "MAESTRO"]),
  async (req, res) => {
    try {
      const observacion = await prisma.observacion.findUnique({
        where: { id: req.params.id },
        include: INCLUDE,
      });

      if (!observacion) {
        return res.status(404).json({
          success: false,
          message: "Observación no encontrada",
        });
      }

      if (
        req.user.role === "MAESTRO" &&
        observacion.createdById !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          message: "No autorizado",
        });
      }

      res.json({ success: true, data: observacion });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener la observación",
      });
    }
  }
);

/* =========================================
   ✅ REGISTRAR
========================================= */
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "MAESTRO"]),
  async (req, res) => {
    try {
      const {
        titulo,
        descripcion,
        tipo,
        gravedad,
        alumnoId,
        docenteId,
        grupoId,
        materiaId,
        claseId,
        evidenciaUrl,
      } = req.body;

      if (!titulo || !descripcion) {
        return res.status(400).json({
          success: false,
          message: "El título y la descripción son requeridos",
        });
      }

      // 🔒 Una observación que no se refiere a nada es un post-it.
      if (!alumnoId && !docenteId && !grupoId && !materiaId && !claseId) {
        return res.status(400).json({
          success: false,
          message:
            "La observación debe referirse al menos a un alumno, docente, grupo, materia o clase",
        });
      }

      // 🔒 Un maestro no registra observaciones sobre otros docentes.
      if (req.user.role === "MAESTRO" && docenteId) {
        return res.status(403).json({
          success: false,
          message: "No puedes registrar observaciones sobre docentes",
        });
      }

      const observacion = await prisma.observacion.create({
        data: {
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          tipo: tipo || "OTRA",
          gravedad: gravedad || "MEDIA",
          alumnoId: alumnoId || null,
          docenteId: docenteId || null,
          grupoId: grupoId || null,
          materiaId: materiaId || null,
          claseId: claseId || null,
          evidenciaUrl: evidenciaUrl || null,
          createdById: req.user.id,
        },
        include: INCLUDE,
      });

      res.status(201).json({ success: true, data: observacion });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al registrar la observación",
      });
    }
  }
);

/* =========================================
   💬 AGREGAR SEGUIMIENTO
   Es lo que la convierte en algo vivo y no en un comentario.
========================================= */
router.post(
  "/:id/seguimiento",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "MAESTRO"]),
  async (req, res) => {
    try {
      const { nota, estatusNuevo } = req.body;

      if (!nota || !nota.trim()) {
        return res.status(400).json({
          success: false,
          message: "La nota de seguimiento no puede ir vacía",
        });
      }

      const observacion = await prisma.observacion.findUnique({
        where: { id: req.params.id },
      });

      if (!observacion) {
        return res.status(404).json({
          success: false,
          message: "Observación no encontrada",
        });
      }

      if (["RESUELTA", "CERRADA"].includes(observacion.estatus)) {
        return res.status(400).json({
          success: false,
          message: "Una observación cerrada ya no admite seguimiento",
        });
      }

      // El seguimiento y el cambio de estatus son una sola operación:
      // no debe quedar una nota sin su cambio, ni al revés.
      const resultado = await prisma.$transaction(async (tx) => {
        await tx.observacionSeguimiento.create({
          data: {
            observacionId: observacion.id,
            nota: nota.trim(),
            estatusNuevo: estatusNuevo || null,
            createdById: req.user.id,
          },
        });

        return tx.observacion.update({
          where: { id: observacion.id },
          data: {
            estatus: estatusNuevo || "EN_SEGUIMIENTO",
            updatedById: req.user.id,
            ...(estatusNuevo === "RESUELTA" || estatusNuevo === "CERRADA"
              ? {
                  resueltaEn: new Date(),
                  resolucion: nota.trim(),
                  resueltaPorId: req.user.id,
                }
              : {}),
          },
          include: INCLUDE,
        });
      });

      res.status(201).json({ success: true, data: resultado });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al registrar el seguimiento",
      });
    }
  }
);

/* =========================================
   ✏️ EDITAR
   Solo mientras siga abierta.
========================================= */
router.put(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { titulo, descripcion, tipo, gravedad, evidenciaUrl } = req.body;

      const observacion = await prisma.observacion.findUnique({
        where: { id: req.params.id },
      });

      if (!observacion) {
        return res.status(404).json({
          success: false,
          message: "Observación no encontrada",
        });
      }

      if (["RESUELTA", "CERRADA"].includes(observacion.estatus)) {
        return res.status(400).json({
          success: false,
          message: "Una observación cerrada ya no se edita",
        });
      }

      const actualizada = await prisma.observacion.update({
        where: { id: observacion.id },
        data: {
          titulo: titulo ?? undefined,
          descripcion: descripcion ?? undefined,
          tipo: tipo ?? undefined,
          gravedad: gravedad ?? undefined,
          evidenciaUrl: evidenciaUrl ?? undefined,
          updatedById: req.user.id,
        },
        include: INCLUDE,
      });

      res.json({ success: true, data: actualizada });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar la observación",
      });
    }
  }
);

export default router;
