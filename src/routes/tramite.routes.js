import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { auditar } from "../lib/audit.js";

const router = express.Router();

/**
 * 🗂️ TRÁMITES — el puente caja → secretaría
 *
 * Cuando caja cobra un concepto con `generaTramite`, se crea aquí un
 * trámite en la misma transacción del pago. Antes esos trámites se
 * generaban y no había forma de verlos.
 *
 * Flujo: SOLICITADO → EN_PROCESO → LISTO → ENTREGADO
 * (o CANCELADO en cualquier punto, con motivo).
 */

const FLUJO = {
  SOLICITADO: ["EN_PROCESO", "CANCELADO"],
  EN_PROCESO: ["LISTO", "CANCELADO"],
  LISTO: ["ENTREGADO", "CANCELADO"],
  ENTREGADO: [],
  CANCELADO: [],
};

/* =========================================
   📄 LISTA DE TRÁMITES
========================================= */
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "CAJA"]),
  async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(200, Number(req.query.perPage) || 50);

      const where = {
        ...(req.query.estado ? { estado: req.query.estado } : {}),
        ...(req.query.alumnoId ? { alumnoId: req.query.alumnoId } : {}),
        ...(req.query.concepto
          ? { concepto: { clave: req.query.concepto } }
          : {}),
      };

      const [tramites, total, pendientes] = await Promise.all([
        prisma.tramite.findMany({
          where,
          include: {
            // La constancia imprime semestre, turno y trayectoria: sin
            // estos anidados salen vacíos en el documento.
            alumno: {
              include: {
                user: true,
                carrera: true,
                trayectoria: true,
                grupo: { include: { turno: true, semestre: true } },
              },
            },
            concepto: true,
            pago: { select: { folio: true, pagadoEn: true, estado: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.tramite.count({ where }),
        prisma.tramite.count({
          where: { estado: { in: ["SOLICITADO", "EN_PROCESO"] } },
        }),
      ]);

      res.json({
        success: true,
        data: tramites,
        meta: { page, perPage, total, pendientes },
      });
    } catch (error) {
      console.error("ERROR TRÁMITES:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener los trámites",
      });
    }
  }
);

/* =========================================
   📄 TRÁMITES DE UN ALUMNO
========================================= */
router.get(
  "/alumno/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "CAJA", "ALUMNO"]),
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

      const tramites = await prisma.tramite.findMany({
        where: { alumnoId },
        include: {
          concepto: true,
          pago: { select: { folio: true, pagadoEn: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ success: true, data: tramites });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener los trámites del alumno",
      });
    }
  }
);

/* =========================================
   ✅ CREAR TRÁMITE MANUAL
   No todo trámite nace de un cobro: secretaría también
   levanta solicitudes sin pago de por medio.
========================================= */
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId, conceptoPagoId, notas } = req.body;

      if (!alumnoId) {
        return res.status(400).json({
          success: false,
          message: "El alumno es requerido",
        });
      }

      const alumno = await prisma.alumno.findUnique({ where: { id: alumnoId } });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      const tramite = await prisma.tramite.create({
        data: {
          alumnoId,
          conceptoPagoId: conceptoPagoId || null,
          notas: notas || null,
          estado: "SOLICITADO",
        },
        include: { concepto: true, alumno: { include: { user: true } } },
      });

      res.status(201).json({ success: true, data: tramite });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al crear el trámite",
      });
    }
  }
);

/* =========================================
   🔄 AVANZAR EL TRÁMITE
========================================= */
router.put(
  "/:id/estado",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { estado, notas } = req.body;

      const tramite = await prisma.tramite.findUnique({
        where: { id: req.params.id },
      });

      if (!tramite) {
        return res.status(404).json({
          success: false,
          message: "Trámite no encontrado",
        });
      }

      const permitidos = FLUJO[tramite.estado] ?? [];

      // 🔒 El flujo no se salta: un trámite no pasa de SOLICITADO
      // a ENTREGADO sin haber estado LISTO.
      if (!permitidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message:
            permitidos.length === 0
              ? `Un trámite ${tramite.estado} ya no cambia de estado`
              : `Desde ${tramite.estado} solo puede pasar a: ${permitidos.join(", ")}`,
        });
      }

      if (estado === "CANCELADO" && !notas) {
        return res.status(400).json({
          success: false,
          message: "Cancelar un trámite requiere una nota con el motivo",
        });
      }

      const actualizado = await prisma.tramite.update({
        where: { id: tramite.id },
        data: {
          estado,
          notas: notas ?? tramite.notas,
          atendidoPorId: req.user.id,
          atendidoEn: tramite.atendidoEn ?? new Date(),
          ...(estado === "ENTREGADO" ? { entregadoEn: new Date() } : {}),
        },
        include: {
          concepto: true,
          alumno: { include: { user: true } },
        },
      });

      await auditar({
        req,
        accion: estado === "CANCELADO" ? "CANCELAR" : "ACTUALIZAR",
        entidad: "Tramite",
        entidadId: actualizado.id,
        antes: { estado: tramite.estado },
        despues: { estado: actualizado.estado, notas: actualizado.notas },
      });

      res.json({ success: true, data: actualizado });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar el trámite",
      });
    }
  }
);

export default router;
