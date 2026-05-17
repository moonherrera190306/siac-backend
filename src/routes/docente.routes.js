import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/* =========================
   👨‍🏫 LISTAR DOCENTES
========================= */
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const docentes = await prisma.docente.findMany({
        include: {
          user: true,
        },
      });

      return res.status(200).json({
        success: true,
        data: docentes,
      });
    } catch (error) {
      console.error("ERROR DOCENTES:", error);

      return res.status(500).json({
        success: false,
        message: "Error cargando docentes",
      });
    }
  }
);

/* =========================
   📊 DASHBOARD MAESTRO
========================= */
router.get(
  "/dashboard",
  verifyToken,
  checkRole(["MAESTRO"]),
  async (req, res) => {
    try {
      const userId = req.user.id;

      const docente = await prisma.docente.findUnique({
        where: {
          userId,
        },
      });

      if (!docente) {
        return res.status(404).json({
          success: false,
          message: "Docente no encontrado",
        });
      }

      const materias = await prisma.materia.findMany({
        where: {
          docenteId: docente.id,
        },
        include: {
          grupo: {
            include: {
              alumnos: true,
            },
          },
        },
      });

      const totalGrupos = materias.length;

      const totalAlumnos = materias.reduce(
        (acc, materia) =>
          acc + (materia.grupo?.alumnos?.length ?? 0),
        0
      );

      return res.status(200).json({
        success: true,
        data: {
          totalGrupos,
          totalAlumnos,
          materias: materias.length,
          promedioGeneral: 8.7,
        },
      });
    } catch (error) {
      console.error("ERROR DASHBOARD:", error);

      return res.status(500).json({
        success: false,
        message: "Error cargando dashboard",
      });
    }
  }
);

/* =========================
   👥 GRUPOS DEL MAESTRO
========================= */
router.get(
  "/grupos",
  verifyToken,
  checkRole(["MAESTRO"]),
  async (req, res) => {
    try {
      const userId = req.user.id;

      const docente = await prisma.docente.findUnique({
        where: {
          userId,
        },
      });

      if (!docente) {
        return res.status(404).json({
          success: false,
          message: "Docente no encontrado",
        });
      }

      const materias = await prisma.materia.findMany({
        where: {
          docenteId: docente.id,
        },
        include: {
          grupo: {
            include: {
              alumnos: true,
            },
          },
        },
      });

      const grupos = [
        ...new Map(
          materias.map((m) => [
            m.grupo.id,
            {
              id: m.grupo.id,
              nombre: m.grupo.nombre,
              totalAlumnos:
                m.grupo.alumnos?.length ?? 0,
            },
          ])
        ).values(),
      ];

      return res.status(200).json({
        success: true,
        data: grupos,
      });
    } catch (error) {
      console.error("ERROR GRUPOS:", error);

      return res.status(500).json({
        success: false,
        message: "Error al obtener grupos",
      });
    }
  }
);

export default router;