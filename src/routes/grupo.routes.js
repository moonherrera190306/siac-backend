import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// 🔥 1. LISTAR TODOS LOS GRUPOS (LO QUE TE FALTA)
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const grupos = await prisma.grupo.findMany({
        include: {
          alumnos: true,
          materias: true
        }
      });

      res.json(grupos);

    } catch (error) {
      console.error("Error en GET /grupos", error);
      res.status(500).json({ message: "Error al obtener grupos" });
    }
  }
);


// 🔥 2. OBTENER GRUPO POR ID (YA LO TENÍAS)
router.get(
  "/:id",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      const grupo = await prisma.grupo.findUnique({
        where: { id },
        include: {
          alumnos: {
            include: {
              user: true
            }
          },
          materias: {
            include: {
              docente: {
                include: {
                  user: true
                }
              }
            }
          }
        }
      });

      if (!grupo) {
        return res.status(404).json({
          message: "Grupo no encontrado"
        });
      }

      res.json(grupo);

    } catch (error) {
      console.error("Error en GET /grupos/:id", error);
      res.status(500).json({
        message: "Error al obtener grupo"
      });
    }
  }
);

export default router;