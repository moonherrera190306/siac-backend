import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/**
 * 🧭 TRAYECTORIAS / ÁREAS PROPEDÉUTICAS (UMSNH)
 *
 * Son exclusivas de preparatoria: cada trayectoria pertenece a un
 * NivelAcademico. En universidad no aplican y no deben mostrarse.
 */

const CLAVE_PREPA = "PREPARATORIA";

// 📄 LISTAR — se puede filtrar por nivel
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { nivelAcademicoId, soloPreparatoria } = req.query;

      let filtro = {};

      if (nivelAcademicoId) {
        filtro = { nivelAcademicoId };
      } else if (soloPreparatoria === "true") {
        // Atajo para el frontend: no necesita conocer el id del nivel.
        filtro = { nivelAcademico: { clave: CLAVE_PREPA } };
      }

      const trayectorias = await prisma.trayectoria.findMany({
        where: filtro,
        include: {
          nivelAcademico: true,
          _count: { select: { alumnos: true, materias: true } },
        },
        orderBy: { clave: "asc" },
      });

      res.json({ success: true, data: trayectorias });
    } catch (error) {
      console.error("ERROR TRAYECTORIAS:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener las trayectorias",
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
      const { clave, nombre, seccion, nivelAcademicoId } = req.body;

      if (!clave || !nombre) {
        return res.status(400).json({
          success: false,
          message: "Clave y nombre son requeridos",
        });
      }

      if (!nivelAcademicoId) {
        return res.status(400).json({
          success: false,
          message: "La trayectoria debe pertenecer a un nivel académico",
        });
      }

      const nivel = await prisma.nivelAcademico.findUnique({
        where: { id: nivelAcademicoId },
      });

      if (!nivel) {
        return res.status(404).json({
          success: false,
          message: "Nivel académico no encontrado",
        });
      }

      // 🔒 Regla del negocio: las trayectorias son de preparatoria.
      if (nivel.clave !== CLAVE_PREPA) {
        return res.status(400).json({
          success: false,
          message:
            "Las trayectorias solo aplican en preparatoria (UMSNH), no en universidad",
        });
      }

      const existe = await prisma.trayectoria.findUnique({
        where: { clave: String(clave).trim() },
      });

      if (existe) {
        return res.status(400).json({
          success: false,
          message: "Ya existe una trayectoria con esa clave",
        });
      }

      const trayectoria = await prisma.trayectoria.create({
        data: {
          clave: String(clave).trim(),
          nombre: nombre.trim(),
          seccion: seccion ? String(seccion).trim() : null,
          nivelAcademicoId,
        },
        include: { nivelAcademico: true },
      });

      res.status(201).json({ success: true, data: trayectoria });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al crear la trayectoria",
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
      const { nombre, seccion } = req.body;

      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: "El nombre es requerido",
        });
      }

      const trayectoria = await prisma.trayectoria.update({
        where: { id: req.params.id },
        data: {
          nombre: nombre.trim(),
          seccion: seccion ? String(seccion).trim() : null,
        },
        include: { nivelAcademico: true },
      });

      res.json({ success: true, data: trayectoria });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar la trayectoria",
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

      const [alumnos, materias] = await Promise.all([
        prisma.alumno.count({ where: { trayectoriaId: id } }),
        prisma.materia.count({ where: { trayectoriaId: id } }),
      ]);

      if (alumnos > 0 || materias > 0) {
        return res.status(400).json({
          success: false,
          message: `No se puede eliminar: tiene ${alumnos} alumno(s) y ${materias} materia(s) asociados`,
        });
      }

      await prisma.trayectoria.delete({ where: { id } });

      res.json({ success: true, message: "Trayectoria eliminada" });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al eliminar la trayectoria",
      });
    }
  }
);

export default router;
