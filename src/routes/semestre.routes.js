import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// ✅ CREAR SEMESTRE
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { nombre, carreraId } = req.body;

      // 🔴 VALIDACIÓN
      if (!nombre || !carreraId) {
        return res.status(400).json({
          message: "Nombre y carreraId son requeridos"
        });
      }

      const semestre = await prisma.semestre.create({
        data: {
          nombre,
          carreraId
        }
      });

      res.json(semestre);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al crear semestre"
      });
    }
  }
);


// 📄 LISTAR SEMESTRES
router.get(
  "/",
  verifyToken,
  async (req, res) => {
    try {
      const data = await prisma.semestre.findMany({
        include: {
          carrera: true
        }
      });

      res.json(data);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al obtener semestres"
      });
    }
  }
);

export default router;