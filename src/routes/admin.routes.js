import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// 🔐 DASHBOARD ADMIN
router.get(
  "/dashboard",
  verifyToken,
  checkRole(["ADMIN"]), // 🔥 mejor usar array
  async (req, res) => {
    try {
      const totalAlumnos = await prisma.alumno.count();
      const totalDocentes = await prisma.docente.count();
      const totalGrupos = await prisma.grupo.count();
      const totalPagos = await prisma.pago.count();

      res.json({
        totalAlumnos,
        totalDocentes,
        totalGrupos,
        totalPagos
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error en dashboard" });
    }
  }
);


// 🔥 NUEVA RUTA → USUARIOS
router.get(
  "/usuarios",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const usuarios = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          activo: true
        }
      });

      res.json(usuarios);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error cargando usuarios" });
    }
  }
);

export default router;