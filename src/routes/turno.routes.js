import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/**
 * 🕘 TURNOS
 * Antes `Grupo.turno` era un String suelto. Ahora es catálogo.
 */

// 📄 LISTAR
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const turnos = await prisma.turno.findMany({
        include: { _count: { select: { grupos: true } } },
        orderBy: { clave: "asc" },
      });

      res.json({ success: true, data: turnos });
    } catch (error) {
      console.error("ERROR TURNOS:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener los turnos",
      });
    }
  }
);

// ✅ CREAR
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { clave, nombre } = req.body;

      if (!clave || !nombre) {
        return res.status(400).json({
          success: false,
          message: "Clave y nombre son requeridos",
        });
      }

      const existe = await prisma.turno.findUnique({
        where: { clave: clave.trim().toUpperCase() },
      });

      if (existe) {
        return res.status(400).json({
          success: false,
          message: "Ya existe un turno con esa clave",
        });
      }

      const turno = await prisma.turno.create({
        data: { clave: clave.trim().toUpperCase(), nombre: nombre.trim() },
      });

      res.status(201).json({ success: true, data: turno });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al crear el turno",
      });
    }
  }
);

// ✏️ ACTUALIZAR
router.put(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { nombre } = req.body;

      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: "El nombre es requerido",
        });
      }

      const turno = await prisma.turno.update({
        where: { id: req.params.id },
        data: { nombre: nombre.trim() },
      });

      res.json({ success: true, data: turno });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar el turno",
      });
    }
  }
);

// 🗑️ ELIMINAR
router.delete(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const grupos = await prisma.grupo.count({ where: { turnoId: id } });

      if (grupos > 0) {
        return res.status(400).json({
          success: false,
          message: `No se puede eliminar: tiene ${grupos} grupo(s) asociado(s)`,
        });
      }

      await prisma.turno.delete({ where: { id } });

      res.json({ success: true, message: "Turno eliminado" });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al eliminar el turno",
      });
    }
  }
);

export default router;
