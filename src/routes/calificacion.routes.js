import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// 🔥 GUARDAR / ACTUALIZAR CALIFICACIONES
router.post(
  "/",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN"]),
  async (req, res) => {
    try {
      const calificaciones = req.body;

      if (!Array.isArray(calificaciones)) {
        return res.status(400).json({
          message: "Se espera un arreglo de calificaciones"
        });
      }

      const operaciones = calificaciones.map((c) => {
        const { alumnoId, materiaId, tipo, calificacion } = c;

        if (!alumnoId || !materiaId || !tipo) {
          throw new Error("Datos incompletos");
        }

        if (
          typeof calificacion !== "number" ||
          calificacion < 0 ||
          calificacion > 100
        ) {
          throw new Error("Calificación inválida");
        }

        return prisma.calificacion.upsert({
          where: {
            alumnoId_materiaId_tipo: {
              alumnoId,
              materiaId,
              tipo
            }
          },
          update: {
            calificacion
          },
          create: {
            alumnoId,
            materiaId,
            tipo,
            calificacion
          }
        });
      });

      const result = await prisma.$transaction(operaciones);

      res.json(result);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: error.message
      });
    }
  }
);


// 🔥 🔥 🔥 CORREGIDO → CALIFICACIONES POR ALUMNO (USER ID)
router.get(
  "/alumno/:id",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 🔥 primero buscar alumno por userId
      const alumno = await prisma.alumno.findUnique({
        where: { userId: id }
      });

      if (!alumno) {
        return res.status(404).json({
          message: "Alumno no encontrado"
        });
      }

      const data = await prisma.calificacion.findMany({
        where: { alumnoId: alumno.id },
        include: {
          materia: true
        }
      });

      res.json(data);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: error.message
      });
    }
  }
);


// 📄 VER CALIFICACIONES POR MATERIA
router.get(
  "/materia/:id",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      const data = await prisma.calificacion.findMany({
        where: { materiaId: id },
        include: {
          alumno: {
            include: {
              user: true
            }
          }
        },
        orderBy: {
          alumno: {
            user: {
              name: "asc"
            }
          }
        }
      });

      res.json(data);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: error.message
      });
    }
  }
);

export default router;