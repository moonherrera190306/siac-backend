import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { buscarExalumnos, obtenerResumenArchivo } from "../lib/archivo.js";

const router = express.Router();

/**
 * 🗄️ ARCHIVO HISTÓRICO dentro del SIAC (solo lectura).
 * Los datos viven en la app de biblioteca; aquí solo se consultan.
 */
const ROLES = ["ADMIN", "DIRECTOR", "SECRETARIA"];

// GET /api/archivo/resumen — conteos y estado de la carga del OCR
router.get("/resumen", verifyToken, checkRole(ROLES), async (req, res) => {
  try {
    const data = await obtenerResumenArchivo();
    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(502).json({ success: false, message: error.message });
  }
});

// GET /api/archivo/exalumnos?q=nombre o matrícula
router.get("/exalumnos", verifyToken, checkRole(ROLES), async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const data = q.length < 2 ? [] : await buscarExalumnos(q);
    res.json({ success: true, data: data ?? [] });
  } catch (error) {
    console.error(error);
    res.status(502).json({ success: false, message: error.message });
  }
});

export default router;
