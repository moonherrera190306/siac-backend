import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// 📄 DOCUMENTOS DEL ALUMNO
router.get("/:userId", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const alumno = await prisma.alumno.findUnique({
      where: { userId }
    });

    if (!alumno) {
      return res.status(404).json({ message: "Alumno no encontrado" });
    }

    const documentos = await prisma.documento.findMany({
      where: {
        alumnoId: alumno.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json(documentos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

export default router;