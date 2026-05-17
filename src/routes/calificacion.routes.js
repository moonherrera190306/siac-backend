import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/* =========================================
   📝 GUARDAR CALIFICACIONES
========================================= */
router.post(
  "/",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN"]),
  async (req, res) => {
    try {
      const calificaciones = req.body;

      if (!Array.isArray(calificaciones)) {
        return res.status(400).json({
          success: false,
          message:
            "Se espera un arreglo de calificaciones",
        });
      }

      if (calificaciones.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No hay calificaciones para guardar",
        });
      }

      const result = await Promise.all(
        calificaciones.map(async (c) => {
          const {
            alumnoId,
            materiaId,
            calificacion,
          } = c;

          if (!alumnoId || !materiaId) {
            throw new Error(
              "Alumno y materia son requeridos"
            );
          }

          const nota = Number(calificacion);

          if (isNaN(nota)) {
            throw new Error(
              "La calificación debe ser numérica"
            );
          }

          if (nota < 0) {
            throw new Error(
              "La calificación no puede ser negativa"
            );
          }

          if (nota > 100) {
            throw new Error(
              "La calificación no puede ser mayor a 100"
            );
          }

          const existente =
            await prisma.calificacion.findFirst({
              where: {
                alumnoId,
                materiaId,
              },
            });

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

          return prisma.calificacion.create({
            data: {
              alumnoId,
              materiaId,
              calificacion: nota,
            },
          });
        })
      );

      return res.status(200).json({
        success: true,
        message:
          "Calificaciones guardadas correctamente",
        data: result,
      });
    } catch (error) {
      console.error(
        "ERROR GUARDANDO CALIFICACIONES:",
        error
      );

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
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message:
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
          materia: true,
        },
      });

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message:
          "Error obteniendo calificaciones",
      });
    }
  }
);

export default router;