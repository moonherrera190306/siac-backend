import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// ✅ CREAR PROGRAMA
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { nombre } = req.body;

      // 🔴 VALIDACIÓN
      if (!nombre) {
        return res.status(400).json({
          message: "El nombre es requerido"
        });
      }

      const programa = await prisma.programa.create({
        data: { nombre }
      });

      res.json(programa);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al crear programa"
      });
    }
  }
);


// 📄 LISTAR PROGRAMAS
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      // Incluye el nivel: el frontend lo necesita para saber si
      // aplican trayectorias (solo preparatoria).
      const programas = await prisma.programa.findMany({
        include: { nivelAcademico: true }
      });

      res.json(programas);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al obtener programas"
      });
    }
  }
);

export default router;