import express from "express";
import bcrypt from "bcrypt";
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


// 🔥 CREAR USUARIO
// Solo para roles de staff: alumnos y docentes se dan de alta desde
// sus propios módulos, porque además crean su registro académico.
router.post(
  "/usuarios",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { name, email, role } = req.body;

      if (!name || !email || !role) {
        return res.status(400).json({
          success: false,
          message: "Nombre, correo y rol son requeridos"
        });
      }

      const PERMITIDOS = ["ADMIN", "DIRECTOR", "SECRETARIA", "CAJA"];

      if (!PERMITIDOS.includes(role)) {
        return res.status(400).json({
          success: false,
          message:
            "Los alumnos se dan de alta en Alumnos y los maestros en Maestros: ahí se crea también su registro académico"
        });
      }

      const existe = await prisma.user.findUnique({ where: { email } });

      if (existe) {
        return res.status(400).json({
          success: false,
          message: "Ese correo ya está registrado"
        });
      }

      // Contraseña temporal aleatoria; el usuario debe cambiarla al entrar.
      const alfabeto =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

      let temporal = "";

      for (let i = 0; i < 10; i++) {
        temporal += alfabeto[Math.floor(Math.random() * alfabeto.length)];
      }

      const user = await prisma.user.create({
        data: {
          name,
          email,
          role,
          password: await bcrypt.hash(temporal, 10),
          debeCambiarPassword: true
        },
        select: { id: true, name: true, email: true, role: true, activo: true }
      });

      res.status(201).json({
        success: true,
        message: "Usuario creado",
        data: user,
        passwordTemporal: temporal
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al crear el usuario"
      });
    }
  }
);


// 🔁 ACTIVAR / DESACTIVAR USUARIO
router.put(
  "/usuarios/:id/estado",
  verifyToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { activo } = req.body;

      // 🔒 Un administrador no puede desactivarse a sí mismo:
      // se quedaría sin forma de volver a entrar.
      if (req.params.id === req.user.id) {
        return res.status(400).json({
          success: false,
          message: "No puedes desactivar tu propia cuenta"
        });
      }

      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { activo: Boolean(activo) },
        select: { id: true, name: true, email: true, role: true, activo: true }
      });

      res.json({ success: true, data: user });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al cambiar el estado del usuario"
      });
    }
  }
);

export default router;