import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

router.get(
  "/",
  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR"
  ]),

  async (req, res) => {
    try {

      const docentes =
        await prisma.docente.findMany();

      res.json({
        data: docentes
      });

    } catch (error) {

      console.error(
        "ERROR DOCENTES:",
        error
      );

      res.status(500).json({
        message:
          "Error al obtener docentes"
      });
    }
  }
);

export default router;