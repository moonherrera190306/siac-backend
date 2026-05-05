import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// 🔥 1. LISTAR DOCENTES (PARA ADMIN)
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const docentes = await prisma.docente.findMany({
        include: {
          user: true
        }
      });

      res.json(docentes);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error cargando docentes" });
    }
  }
);


// 🔥 2. GRUPOS DEL MAESTRO (YA LO TENÍAS)
router.get("/grupos", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const docente = await prisma.docente.findUnique({
      where: { userId },
    });

    if (!docente) {
      return res.status(404).json({ error: "Docente no encontrado" });
    }

    const materias = await prisma.materia.findMany({
      where: { docenteId: docente.id },
      include: { grupo: true },
    });

    const grupos = [
      ...new Map(materias.map(m => [m.grupo.id, m.grupo])).values()
    ];

    res.json(grupos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener grupos" });
  }
});

export default router;