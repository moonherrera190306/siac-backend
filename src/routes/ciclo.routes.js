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

      console.error(
        "ERROR OBTENER CICLOS:",
        error
      );

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

      // 🔴 VALIDACIÓN
      if (!nombre) {

        return res.status(400).json({

          success: false,

          message:
            "Nombre requerido"

        });

      }

      // 🔍 VALIDAR EXISTENTE
      const existe =
        await prisma.cicloEscolar.findFirst({

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

      // 🔥 CREAR
      const ciclo =
        await prisma.cicloEscolar.create({

          data: {

            nombre,

            fechaInicio:
              fechaInicio
                ? new Date(fechaInicio)
                : null,

            fechaFin:
              fechaFin
                ? new Date(fechaFin)
                : null,

            activo: false

          }

        });

      res.json({

        success: true,

        message:
          "Ciclo creado correctamente",

        data: ciclo

      });

    } catch (error) {

      console.error(
        "ERROR CREAR CICLO:",
        error
      );

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

      // 🔥 DESACTIVAR TODOS
      await prisma.cicloEscolar.updateMany({

        data: {
          activo: false
        }

      });

      // 🔥 ACTIVAR UNO
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
          "Ciclo activado correctamente",

        data: ciclo

      });

    } catch (error) {

      console.error(
        "ERROR ACTIVAR CICLO:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Error activando ciclo"

      });

    }

  }
);


// ========================================
// ❌ ELIMINAR CICLO
// ========================================
router.delete(
  "/:id",

  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR"
  ]),

  async (req, res) => {

    try {

      const { id } = req.params;

      await prisma.cicloEscolar.delete({

        where: {
          id
        }

      });

      res.json({

        success: true,

        message:
          "Ciclo eliminado correctamente"

      });

    } catch (error) {

      console.error(
        "ERROR ELIMINAR CICLO:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Error eliminando ciclo"

      });

    }

  }
);

export default router;