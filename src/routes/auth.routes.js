import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

const router = express.Router();


// =============================
// 🔐 LOGIN
// =============================
router.post("/login", async (req, res) => {
  try {

    const { email, password } = req.body;

    // 🔴 Validación básica
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email y contraseña requeridos"
      });
    }

    // 🔍 Buscar usuario + relaciones
    const user = await prisma.user.findUnique({
      where: {
        email
      },

      include: {
        alumno: true
      }
    });

    // ❌ Usuario no existe
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no existe"
      });
    }

    // 🔐 Validar contraseña
    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    // ❌ Password incorrecto
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Password incorrecto"
      });
    }

    // 🔐 Validar secret
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET no definido");
    }

    // 🎟️ Generar token
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,

        // 🔥 IMPORTANTE
        alumnoId: user.alumno?.id || null

      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h"
      }
    );

    // ✅ Respuesta
    res.json({
      success: true,

      token,

      user: {
        id: user.id,

        // 🔥 IMPORTANTE
        alumnoId: user.alumno?.id || null,

        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {

    console.error(
      "❌ Error en login:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Error en servidor"
    });

  }
});


// =============================
// 🚀 SEED USUARIOS (TEMPORAL)
// =============================
router.get("/seed-users", async (req, res) => {
  try {

    const password = await bcrypt.hash(
      "123456",
      10
    );

    const users = [
      {
        name: "Admin",
        email: "admin@siac.com",
        role: "ADMIN"
      },
      {
        name: "Caja",
        email: "caja@siac.com",
        role: "CAJA"
      },
      {
        name: "Director",
        email: "director@siac.com",
        role: "DIRECTOR"
      },
      {
        name: "Secretaria",
        email: "secretaria@siac.com",
        role: "SECRETARIA"
      },
      {
        name: "Maestro",
        email: "maestro@siac.com",
        role: "MAESTRO"
      }
    ];

    for (const u of users) {

      const exists =
        await prisma.user.findUnique({
          where: {
            email: u.email
          }
        });

      if (!exists) {

        await prisma.user.create({
          data: {
            ...u,
            password
          }
        });

        console.log(
          `✅ ${u.role} creado`
        );

      } else {

        console.log(
          `⚠️ ${u.role} ya existe`
        );

      }
    }

    res.json({
      success: true,
      message:
        "Usuarios creados correctamente 🔥"
    });

  } catch (error) {

    console.error(
      "❌ Error en seed:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Error creando usuarios"
    });

  }
});

export default router;