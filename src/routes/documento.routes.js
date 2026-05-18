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
// 📄 DOCUMENTOS ALUMNO
// ========================================
router.get(
  "/:alumnoId",

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

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message:
            "Alumno no encontrado"
        });
      }

      // 📄 DOCUMENTOS
      const documentos =
        await prisma.documento.findMany({

          where: {
            alumnoId
          },

          orderBy: {
            createdAt: "desc"
          }
        });

      // ✅ RESPONSE
      res.json({
        success: true,
        data: documentos
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Error obteniendo documentos"
      });

    }
  }
);

export default router;