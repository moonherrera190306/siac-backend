import express from "express";
import prisma from "../lib/prisma.js"; // ✅ centralizado
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// ✅ CREAR CARRERA
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { nombre, programaId } = req.body;

      // 🔴 VALIDACIÓN
      if (!nombre || !programaId) {
        return res.status(400).json({
          message: "Nombre y programaId son requeridos"
        });
      }

      const carrera = await prisma.carrera.create({
        data: {
          nombre,
          programaId
        }
      });

      res.json(carrera);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);


// 📄 OBTENER TODAS LAS CARRERAS
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const carreras = await prisma.carrera.findMany({
        include: {
          programa: true
        }
      });

      res.json(carreras);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;