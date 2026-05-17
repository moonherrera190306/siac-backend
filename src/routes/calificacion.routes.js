import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/* =========================================
   📝 GUARDAR / ACTUALIZAR CALIFICACIONES
========================================= */
router.post(
  "/",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN"]),
  async (req, res) => {
    try {
      const calificaciones = req.body;

      // 🔥 validar array
      if (!Array.isArray(calificaciones)) {
        return res.status(400).json({
          success: false,
          message:
            "Se espera un arreglo de calificaciones",
        });
      }

      // 🔥 validar vacío
      if (calificaciones.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No hay calificaciones para guardar",
        });
      }

      const operaciones = calificaciones.map(
  async (c) => {
    const {
      alumnoId,
      materiaId,
      calificacion,
    } = c;

    // 🔥 validar campos
    if (!alumnoId || !materiaId) {
      throw new Error(
        "Alumno y materia son requeridos"
      );
    }

    // 🔥 convertir número
    const nota = Number(calificacion);

    // 🔥 validar número
    if (isNaN(nota)) {
      throw new Error(
        "La calificación debe ser numérica"
      );
    }

    // 🔥 no negativos
    if (nota < 0) {
      throw new Error(
        "La calificación no puede ser negativa"
      );
    }

    // 🔥 máximo 100
    if (nota > 100) {
      throw new Error(
        "La calificación no puede ser mayor a 100"
      );
    }

    // 🔥 buscar existente
    const existente =
      await prisma.calificacion.findFirst({
        where: {
          alumnoId,
          materiaId,
        },
      });

    // 🔥 actualizar si ya existe
    if (existente) {
      return prisma.calificacion.update({
        where: {
          id: existente.id,
        },
        data: {
          calificacion: nota,
        },
      });
    }

    // 🔥 crear nueva
    return prisma.calificacion.create({
      data: {
        alumnoId,
        materiaId,
        calificacion: nota,
      },
    });
  }
);

     const result = await Promise.all(
  operaciones
);

      return res.status(200).json({
        success: true,
        message: "Calificaciones guardadas",
        data: result,
      });
    } catch (error) {
      console.error("ERROR CALIFICACIONES:", error);

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Error guardando calificaciones",
      });
    }
  }
);

/* =========================================
   👨‍🎓 CALIFICACIONES POR ALUMNO
========================================= */
router.get(
  "/alumno/:id",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 🔥 buscar alumno por userId
      const alumno = await prisma.alumno.findUnique({
        where: {
          userId: id,
        },
      });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      const data = await prisma.calificacion.findMany({
        where: {
          alumnoId: alumno.id,
        },
        include: {
          materia: true,
        },
      });

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("ERROR ALUMNO:", error);

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Error obteniendo calificaciones",
      });
    }
  }
);

/* =========================================
   📚 CALIFICACIONES POR MATERIA
========================================= */
router.get(
  "/materia/:id",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      const data = await prisma.calificacion.findMany({
        where: {
          materiaId: id,
        },
        include: {
          alumno: {
            include: {
              user: true,
            },
          },
        },
        orderBy: {
          alumno: {
            user: {
              name: "asc",
            },
          },
        },
      });

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("ERROR MATERIA:", error);

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Error obteniendo calificaciones",
      });
    }
  }
);

export default router;