import express from "express";
import prisma from "../lib/prisma.js";

import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/* ========================================
   📄 REGISTRAR DOCUMENTO EN EL EXPEDIENTE
   La subida del archivo en sí llega en su fase;
   aquí se registra el documento y su estado.
======================================== */
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId, nombre, tipo, url, mime, tamano } = req.body;

      if (!alumnoId || !nombre || !tipo || !url) {
        return res.status(400).json({
          success: false,
          message: "Alumno, nombre, tipo y url son requeridos",
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

      const documento = await prisma.documento.create({
        data: {
          alumnoId,
          nombre,
          tipo,
          url,
          mime: mime || null,
          tamano: tamano ? Number(tamano) : null,
          createdById: req.user.id,
        },
      });

      res.status(201).json({ success: true, data: documento });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al registrar el documento",
      });
    }
  }
);

/* ========================================
   ✅ VALIDAR O RECHAZAR UN DOCUMENTO
   `estado` dejó de ser texto libre: ahora es un enum.
======================================== */
router.put(
  "/:id/validar",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { estado, motivoRechazo } = req.body;

      if (!["VALIDADO", "RECHAZADO", "PENDIENTE"].includes(estado)) {
        return res.status(400).json({
          success: false,
          message: "Estado inválido",
        });
      }

      if (estado === "RECHAZADO" && !motivoRechazo) {
        return res.status(400).json({
          success: false,
          message: "Un documento rechazado necesita motivo",
        });
      }

      const documento = await prisma.documento.update({
        where: { id: req.params.id },
        data: {
          estado,
          motivoRechazo: estado === "RECHAZADO" ? motivoRechazo : null,
          validadoPorId: req.user.id,
          validadoEn: new Date(),
        },
      });

      res.json({ success: true, data: documento });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar el documento",
      });
    }
  }
);

/* ========================================
   📋 LISTA GENERAL DE DOCUMENTOS (secretaría)
   Debe declararse ANTES de "/:alumnoId" o la ruta
   se lo comería como si fuera un id.
======================================== */
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(100, Number(req.query.perPage) || 50);

      const where = {
        ...(req.query.estado ? { estado: req.query.estado } : {}),
        ...(req.query.alumnoId ? { alumnoId: req.query.alumnoId } : {}),
      };

      const [documentos, total] = await Promise.all([
        prisma.documento.findMany({
          where,
          include: {
            alumno: { include: { user: true, grupo: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.documento.count({ where }),
      ]);

      res.json({
        success: true,
        data: documentos,
        meta: { page, perPage, total },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error obteniendo documentos",
      });
    }
  }
);

/* ========================================
   📄 DOCUMENTOS DE UN ALUMNO
======================================== */
router.get(
  "/:alumnoId",

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

      // 🔍 VALIDAR ALUMNO
      const alumno = await prisma.alumno.findUnique({
        where: { id: alumnoId },
      });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      // 📄 DOCUMENTOS
      const documentos = await prisma.documento.findMany({
        where: { alumnoId },
        orderBy: { createdAt: "desc" },
      });

      // ✅ RESPONSE
      res.json({
        success: true,
        data: documentos,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error obteniendo documentos",
      });
    }
  }
);

export default router;
