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
// 📚 ASISTENCIAS ALUMNO
// ========================================
router.get(
  "/alumno/:alumnoId",

  verifyToken,

  checkRole([
    "ADMIN",
    "ALUMNO",
    "DIRECTOR",
    "SECRETARIA"
  ]),

  async (req, res) => {

    try {

      const { alumnoId } =
        req.params;

      // 🔒 SEGURIDAD
      if (
        req.user.role === "ALUMNO" &&
        req.user.alumnoId !== alumnoId
      ) {
        return res.status(403).json({
          success: false,
          message: "No autorizado"
        });
      }

      // 🔍 VALIDAR ALUMNO
      const alumno =
        await prisma.alumno.findUnique({
          where: {
            id: alumnoId
          }
        });

      // ❌ NO EXISTE
      if (!alumno) {
        return res.status(404).json({
          success: false,
          message:
            "Alumno no encontrado"
        });
      }

      // 📚 ASISTENCIAS
      // 🔥 SIN INCLUDE NI ORDERBY
      // PARA EVITAR ERRORES PRISMA
      const asistencias =
        await prisma.asistencia.findMany({

          where: {
            alumnoId
          }

        });

      // ✅ RESPONSE
      res.json({
        success: true,
        data: asistencias
      });

    } catch (error) {

      console.error(
        "🔥 ERROR ASISTENCIAS:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Error obteniendo asistencias",
        error: error.message
      });

    }
  }
);

export default router;