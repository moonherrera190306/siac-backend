import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(
  verifyToken,
  checkRole(["MAESTRO"])
);

// DASHBOARD
router.get("/dashboard", async (req, res) => {
  try {
    const grupos = await prisma.materia.count({
      where: {
        docenteId: req.user.docenteId,
      },
    });

    const alumnos = await prisma.alumno.count();

    return res.json({
      success: true,
      data: {
        grupos,
        alumnos,
        promedioGeneral: 8.7,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// GRUPOS
router.get("/grupos", async (req, res) => {
  try {
    const materias = await prisma.materia.findMany({
      where: {
        docenteId: req.user.docenteId,
      },
      include: {
        grupo: true,
      },
    });

    return res.json({
      success: true,
      data: materias,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// CALIFICACIONES
router.get("/calificaciones", async (req, res) => {
  try {
    const calificaciones =
      await prisma.calificacion.findMany({
        include: {
          alumno: {
            include: {
              user: true,
            },
          },
          materia: true,
        },
      });

    return res.json({
      success: true,
      data: calificaciones,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ASISTENCIAS
router.get("/asistencias", async (req, res) => {
  try {
    const asistencias =
      await prisma.asistencia.findMany({
        include: {
          alumno: {
            include: {
              user: true,
            },
          },
        },
      });

    return res.json({
      success: true,
      data: asistencias,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;