import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/**
 * 🔍 CONSULTA DE AUDITORÍA
 *
 * Responde las preguntas del contexto del proyecto:
 * quién modificó esta calificación, quién registró este pago,
 * quién dio de baja a este alumno y qué valor tenía antes.
 *
 * Solo lectura: un registro de auditoría no se edita ni se borra.
 */

router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(200, Number(req.query.perPage) || 50);

      const desde = req.query.desde ? new Date(req.query.desde) : null;
      const hasta = req.query.hasta ? new Date(req.query.hasta) : null;

      if (hasta) hasta.setHours(23, 59, 59, 999);

      const where = {
        ...(req.query.entidad ? { entidad: req.query.entidad } : {}),
        ...(req.query.entidadId ? { entidadId: req.query.entidadId } : {}),
        ...(req.query.accion ? { accion: req.query.accion } : {}),
        ...(req.query.usuarioId ? { usuarioId: req.query.usuarioId } : {}),
        ...(desde || hasta
          ? {
              createdAt: {
                ...(desde ? { gte: desde } : {}),
                ...(hasta ? { lte: hasta } : {}),
              },
            }
          : {}),
      };

      const [registros, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: {
            usuario: { select: { id: true, name: true, email: true, role: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        success: true,
        data: registros,
        meta: { page, perPage, total, pages: Math.ceil(total / perPage) },
      });
    } catch (error) {
      console.error("ERROR AUDITORÍA:", error);

      res.status(500).json({
        success: false,
        message: "Error al consultar la auditoría",
      });
    }
  }
);

/* =========================================
   🧾 HISTORIAL DE UN REGISTRO
   "¿Qué le ha pasado a esta calificación?"
========================================= */
router.get(
  "/:entidad/:entidadId",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const historial = await prisma.auditLog.findMany({
        where: {
          entidad: req.params.entidad,
          entidadId: req.params.entidadId,
        },
        include: {
          usuario: { select: { name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
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

export default router;
