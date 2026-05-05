import express from "express";
import prisma from "../lib/prisma.js"; // ✅ centralizado
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// ✅ CREAR MATERIA
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { nombre, grupoId, docenteId } = req.body;

      // 🔴 VALIDACIÓN
      if (!nombre || !grupoId) {
        return res.status(400).json({
          message: "Nombre y grupoId son requeridos"
        });
      }

      const materia = await prisma.materia.create({
        data: {
          nombre,
          grupoId,
          docenteId
        }
      });

      res.json(materia);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al crear materia"
      });
    }
  }
);


// 📄 OBTENER TODAS LAS MATERIAS
router.get(
  "/",
  verifyToken,
  async (req, res) => {
    try {
      const materias = await prisma.materia.findMany({
        include: {
          grupo: true,
          docente: {
            include: {
              user: true // 🔥 importante para frontend
            }
          }
        }
      });

      res.json(materias);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al obtener materias"
      });
    }
  }
);

export default router;