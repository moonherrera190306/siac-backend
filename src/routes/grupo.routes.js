import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

router.get(
  "/",
  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR",
    "SECRETARIA",
    "MAESTRO"
  ]),

  async (req, res) => {
    try {

      const grupos =
        await prisma.grupo.findMany();

      res.json({
        data: grupos
      });

    } catch (error) {

      console.error(
        "ERROR GRUPOS:",
        error
      );

      res.status(500).json({
        message:
          "Error al obtener grupos"
      });
    }
  }
);

router.get(
  "/:id",
  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR",
    "SECRETARIA",
    "MAESTRO"
  ]),

  async (req, res) => {
    try {

      const grupo =
        await prisma.grupo.findUnique({
          where: {
            id: req.params.id
          }
        });

      if (!grupo) {
        return res.status(404).json({
          message:
            "Grupo no encontrado"
        });
      }

      res.json({
        data: grupo
      });

    } catch (error) {

      console.error(
        "ERROR GRUPO:",
        error
      );

      res.status(500).json({
        message:
          "Error al obtener grupo"
      });
    }
  }
);

export default router;