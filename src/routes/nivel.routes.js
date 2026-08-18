import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/**
 * 🏛️ NIVELES ACADÉMICOS
 * Raíz de la jerarquía: NivelAcademico → Programa → Carrera → Semestre → Grupo.
 */

// 📄 LISTAR
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const niveles = await prisma.nivelAcademico.findMany({
        include: {
          _count: { select: { programas: true, trayectorias: true } },
        },
        orderBy: { clave: "asc" },
      });

      res.json({ success: true, data: niveles });
    } catch (error) {
      console.error("ERROR NIVELES:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener los niveles",
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

      const existe = await prisma.nivelAcademico.findUnique({
        where: { clave: clave.trim().toUpperCase() },
      });

      if (existe) {
        return res.status(400).json({
          success: false,
          message: "Ya existe un nivel con esa clave",
        });
      }

      const nivel = await prisma.nivelAcademico.create({
        data: { clave: clave.trim().toUpperCase(), nombre: nombre.trim() },
      });

      res.status(201).json({ success: true, data: nivel });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al crear el nivel",
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

      // La clave no se cambia: es la llave de referencia del legado.
      const nivel = await prisma.nivelAcademico.update({
        where: { id: req.params.id },
        data: { nombre: nombre.trim() },
      });

      res.json({ success: true, data: nivel });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar el nivel",
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

      // 🔒 No se borra un nivel que ya tiene estructura colgando.
      const programas = await prisma.programa.count({
        where: { nivelAcademicoId: id },
      });

      if (programas > 0) {
        return res.status(400).json({
          success: false,
          message: `No se puede eliminar: tiene ${programas} programa(s) asociado(s)`,
        });
      }

      await prisma.nivelAcademico.delete({ where: { id } });

      res.json({ success: true, message: "Nivel eliminado" });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al eliminar el nivel",
      });
    }
  }
);

export default router;
