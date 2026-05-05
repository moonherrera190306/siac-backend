import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// 💰 REGISTRAR PAGO
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {
      const { alumnoId, concepto, monto } = req.body;

      if (!alumnoId || !concepto || !monto) {
        return res.status(400).json({
          message: "Datos incompletos"
        });
      }

      const pago = await prisma.pago.create({
        data: {
          alumnoId,
          concepto,
          monto,
          pagadoEn: new Date() // 🔥 SE REGISTRA COMO PAGADO
        }
      });

      res.json(pago);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al registrar pago"
      });
    }
  }
);


// 🔥 OBTENER TODOS LOS PAGOS (IMPORTANTE QUE VA PRIMERO)
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {
      const pagos = await prisma.pago.findMany({
        include: {
          alumno: {
            include: {
              user: true
            }
          }
        },
        orderBy: {
          pagadoEn: "desc"
        }
      });

      res.json(pagos);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);


// 📊 RESUMEN DE PAGOS POR ALUMNO
router.get(
  "/resumen/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {
      const { alumnoId } = req.params;

      const pagos = await prisma.pago.findMany({
        where: { alumnoId }
      });

      const totalPagado = pagos.reduce((acc, p) => acc + p.monto, 0);

      const deudaBase = 1000; // 🔥 luego lo haces dinámico

      res.json({
        totalPagado,
        adeudo: deudaBase - totalPagado
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al obtener resumen"
      });
    }
  }
);


// 📄 PAGOS POR ALUMNO
router.get(
  "/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {
      const { alumnoId } = req.params;

      const pagos = await prisma.pago.findMany({
        where: { alumnoId },
        orderBy: {
          pagadoEn: "desc"
        }
      });

      res.json(pagos);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al obtener pagos"
      });
    }
  }
);


// 🔥 MARCAR PAGO COMO PAGADO (PARA PENDIENTES)
router.put(
  "/pagar/:id",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const pago = await prisma.pago.update({
        where: { id },
        data: {
          pagadoEn: new Date()
        }
      });

      res.json(pago);

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error al actualizar pago"
      });
    }
  }
);

export default router;