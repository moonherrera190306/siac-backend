import express from "express";

import prisma from "../lib/prisma.js";

import {
  verifyToken
} from "../middleware/auth.middleware.js";

import {
  checkRole
} from "../middleware/role.middleware.js";

const router = express.Router();


// ========================================
// 📚 OBTENER CICLOS
// ========================================
router.get(
  "/",

  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR",
    "SECRETARIA"
  ]),

  async (req, res) => {

    try {

      const ciclos =
        await prisma.cicloEscolar.findMany({

          orderBy: {
            createdAt: "desc"
          }

        });

      res.json({
        success: true,
        data: ciclos
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Error obteniendo ciclos"
      });

    }
  }
);


// ========================================
// ➕ CREAR CICLO
// ========================================
router.post(
  "/",

  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR"
  ]),

  async (req, res) => {

    try {

      const {
        nombre,
        fechaInicio,
        fechaFin
      } = req.body;

      if (!nombre) {
        return res.status(400).json({
          success: false,
          message:
            "Nombre requerido"
        });
      }

      const existe =
        await prisma.cicloEscolar.findUnique({
          where: {
            nombre
          }
        });

      if (existe) {
        return res.status(400).json({
          success: false,
          message:
            "El ciclo ya existe"
        });
      }

      const ciclo =
        await prisma.cicloEscolar.create({

          data: {
            nombre,
            fechaInicio,
            fechaFin
          }

        });

      res.json({
        success: true,
        message:
          "Ciclo creado correctamente",
        data: ciclo
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Error creando ciclo"
      });

    }
  }
);


// ========================================
// 🔥 ACTIVAR CICLO
// ========================================
router.put(
  "/activar/:id",

  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR"
  ]),

  async (req, res) => {

    try {

      const { id } = req.params;

      // 🔥 desactivar todos
      await prisma.cicloEscolar.updateMany({
        data: {
          activo: false
        }
      });

      // 🔥 activar uno
      const ciclo =
        await prisma.cicloEscolar.update({

          where: {
            id
          },

          data: {
            activo: true
          }

        });

      res.json({
        success: true,
        message:
          "Ciclo activado",
        data: ciclo
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Error activando ciclo"
      });

    }
  }
);

export default router;