import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// 🔥 REPORTE ALUMNOS
router.get("/alumnos", verifyToken, async (req, res) => {
  const data = await prisma.alumno.findMany({
    include: { user: true, grupo: true }
  });

  res.json(data);
});

// 🔥 REPORTE PAGOS
router.get("/pagos", verifyToken, async (req, res) => {
  const data = await prisma.pago.findMany({
    include: {
      alumno: { include: { user: true } }
    }
  });

  res.json(data);
});

// 🔥 REPORTE GRUPOS
router.get("/grupos", verifyToken, async (req, res) => {
  const data = await prisma.grupo.findMany({
    include: {
      alumnos: true,
      materias: true
    }
  });

  res.json(data);
});

// 🔥 REPORTE ACADÉMICO
router.get("/academico", verifyToken, async (req, res) => {
  const data = await prisma.calificacion.findMany({
    include: {
      alumno: { include: { user: true } },
      materia: true
    }
  });

  res.json(data);
});

export default router;  