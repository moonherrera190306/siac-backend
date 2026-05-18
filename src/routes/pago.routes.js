import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// ==========================================
// 💰 REGISTRAR PAGO
// ==========================================
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {

      const { alumnoId, concepto, monto } = req.body;

      if (!alumnoId || !concepto || !monto) {
        return res.status(400).json({
          success: false,
          message: "Datos incompletos"
        });
      }

      const pago = await prisma.pago.create({
        data: {
          alumnoId,
          concepto,
          monto,
          pagadoEn: new Date()
        }
      });

      res.status(201).json({
        success: true,
        message: "Pago registrado correctamente",
        data: pago
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al registrar pago"
      });

    }
  }
);


// ==========================================
// 🔥 OBTENER TODOS LOS PAGOS
// ==========================================
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

      res.json({
        success: true,
        data: pagos
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener pagos"
      });

    }
  }
);


// ==========================================
// 📊 RESUMEN DE PAGOS POR ALUMNO
// ==========================================
router.get(
  "/resumen/:alumnoId",
  verifyToken,
  checkRole([
    "ADMIN",
    "CAJA",
    "ALUMNO",
    "DIRECTOR",
    "SECRETARIA"
  ]),
  async (req, res) => {
    try {

      const { alumnoId } = req.params;

      // 🔒 SEGURIDAD
      if (
        req.user.role === "ALUMNO" &&
        req.user.alumnoId !== alumnoId
      ) {
        return res.status(403).json({
          success: false,
          message: "No autorizado"
        });
      }

      const pagos = await prisma.pago.findMany({
        where: { alumnoId }
      });

      const totalPagado = pagos.reduce(
        (acc, p) => acc + p.monto,
        0
      );

      const deudaBase = 1000;

      res.json({
        success: true,
        data: {
          totalPagado,
          adeudo: deudaBase - totalPagado
        }
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener resumen"
      });

    }
  }
);


// ==========================================
// 📄 PAGOS POR ALUMNO
// ==========================================
router.get(
  "/:alumnoId",
  verifyToken,
  checkRole([
    "ADMIN",
    "CAJA",
    "ALUMNO",
    "DIRECTOR",
    "SECRETARIA"
  ]),
  async (req, res) => {
    try {

      const { alumnoId } = req.params;

      // 🔒 SEGURIDAD
      if (
        req.user.role === "ALUMNO" &&
        req.user.alumnoId !== alumnoId
      ) {
        return res.status(403).json({
          success: false,
          message: "No autorizado"
        });
      }

      const pagos = await prisma.pago.findMany({
        where: {
          alumnoId
        },

        orderBy: {
          pagadoEn: "desc"
        }
      });

      res.json({
        success: true,
        data: pagos
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener pagos"
      });

    }
  }
);


// ==========================================
// 🔥 MARCAR PAGO COMO PAGADO
// ==========================================
router.put(
  "/pagar/:id",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {

      const { id } = req.params;

      const pago = await prisma.pago.update({
        where: {
          id
        },

        data: {
          pagadoEn: new Date()
        }
      });

      res.json({
        success: true,
        message: "Pago actualizado correctamente",
        data: pago
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar pago"
      });

    }
  }
);

export default router;