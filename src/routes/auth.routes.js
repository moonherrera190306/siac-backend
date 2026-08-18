import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

import { verifyToken, COOKIE_TOKEN } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { auditar } from "../lib/audit.js";

const router = express.Router();

const HORAS_SESION = 8;

const enProduccion = process.env.NODE_ENV === "production";

/**
 * 🔐 El token va en cookie httpOnly: JavaScript del navegador no puede leerlo.
 *
 * En producción el frontend (Vercel) y el backend (Railway) viven en
 * dominios distintos, así que la cookie necesita SameSite=None + Secure.
 */
function opcionesCookie() {
  return {
    httpOnly: true,
    secure: enProduccion,
    sameSite: enProduccion ? "none" : "lax",
    maxAge: HORAS_SESION * 60 * 60 * 1000,
    path: "/",
  };
}

/* =========================================
   ⏱️ LÍMITE DE INTENTOS DE LOGIN
   En memoria: suficiente para una sola instancia.
========================================= */

const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

const intentos = new Map();

function registrarIntento(clave) {
  const ahora = Date.now();
  const previo = intentos.get(clave);

  if (!previo || ahora - previo.desde > VENTANA_MS) {
    intentos.set(clave, { conteo: 1, desde: ahora });
    return 1;
  }

  previo.conteo += 1;
  return previo.conteo;
}

function bloqueado(clave) {
  const previo = intentos.get(clave);

  if (!previo) return false;

  if (Date.now() - previo.desde > VENTANA_MS) {
    intentos.delete(clave);
    return false;
  }

  return previo.conteo >= MAX_INTENTOS;
}

function limpiarIntentos(clave) {
  intentos.delete(clave);
}

/* =========================================
   🔑 FIRMA DEL TOKEN
========================================= */

function firmarToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET no definido");
  }

  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      alumnoId: user.alumno?.id || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: `${HORAS_SESION}h` }
  );
}

function datosPublicos(user) {
  return {
    id: user.id,
    alumnoId: user.alumno?.id || null,
    name: user.name,
    email: user.email,
    role: user.role,
    debeCambiarPassword: user.debeCambiarPassword,
  };
}

// =============================
// 🔐 LOGIN
// =============================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email y contraseña requeridos",
      });
    }

    const clave = `${req.ip}|${String(email).toLowerCase()}`;

    if (bloqueado(clave)) {
      return res.status(429).json({
        success: false,
        message: "Demasiados intentos. Espera unos minutos.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { alumno: true },
    });

    // 🔥 mensaje genérico: no revelamos si el email existe o no
    if (!user) {
      registrarIntento(clave);

      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      registrarIntento(clave);

      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    // 🔒 cuenta desactivada
    if (!user.activo) {
      return res.status(403).json({
        success: false,
        message: "Usuario desactivado",
      });
    }

    limpiarIntentos(clave);

    const token = firmarToken(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { ultimoAcceso: new Date() },
    });

    res.cookie(COOKIE_TOKEN, token, opcionesCookie());

    // 🔍 Bitácora de accesos.
    await auditar({
      req,
      usuarioId: user.id,
      accion: "LOGIN",
      entidad: "User",
      entidadId: user.id,
      despues: { email: user.email, role: user.role },
    });

    // 🔥 El token ya NO se devuelve en el cuerpo: vive solo en la cookie.
    res.json({
      success: true,
      user: datosPublicos(user),
    });
  } catch (error) {
    console.error("❌ Error en login:", error);

    res.status(500).json({
      success: false,
      message: "Error en servidor",
    });
  }
});

// =============================
// 👤 SESIÓN ACTUAL
// =============================
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { alumno: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    res.json({ success: true, user: datosPublicos(user) });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Error obteniendo la sesión",
    });
  }
});

// =============================
// 🔄 RENOVAR SESIÓN
// =============================
router.post("/refresh", verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { alumno: true },
    });

    if (!user || !user.activo) {
      return res.status(401).json({
        success: false,
        message: "Sesión no válida",
      });
    }

    res.cookie(COOKIE_TOKEN, firmarToken(user), opcionesCookie());

    res.json({ success: true, user: datosPublicos(user) });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Error renovando la sesión",
    });
  }
});

// =============================
// 🚪 LOGOUT
// =============================
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_TOKEN, { ...opcionesCookie(), maxAge: undefined });

  res.json({ success: true, message: "Sesión cerrada" });
});

// =============================
// 🔑 CAMBIAR CONTRASEÑA
// Cierra el ciclo de `debeCambiarPassword`.
// =============================
router.post("/cambiar-password", verifyToken, async (req, res) => {
  try {
    const { passwordActual, passwordNueva } = req.body;

    if (!passwordActual || !passwordNueva) {
      return res.status(400).json({
        success: false,
        message: "Se requiere la contraseña actual y la nueva",
      });
    }

    if (passwordNueva.length < 8) {
      return res.status(400).json({
        success: false,
        message: "La nueva contraseña debe tener al menos 8 caracteres",
      });
    }

    if (passwordNueva === passwordActual) {
      return res.status(400).json({
        success: false,
        message: "La nueva contraseña debe ser distinta de la actual",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    const valida = await bcrypt.compare(passwordActual, user.password);

    if (!valida) {
      return res.status(401).json({
        success: false,
        message: "La contraseña actual no es correcta",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(passwordNueva, 10),
        debeCambiarPassword: false,
      },
    });

    res.json({
      success: true,
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Error al cambiar la contraseña",
    });
  }
});

// =============================
// ♻️ RESTABLECER CONTRASEÑA (presencial)
// No hay envío de correo: secretaría o administración generan
// una contraseña temporal y se la entregan al usuario.
// =============================
router.post(
  "/restablecer",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "El correo es requerido",
        });
      }

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
      }

      const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

      let temporal = "";

      for (let i = 0; i < 10; i++) {
        temporal += alfabeto[Math.floor(Math.random() * alfabeto.length)];
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: await bcrypt.hash(temporal, 10),
          debeCambiarPassword: true,
        },
      });

      res.json({
        success: true,
        message: "Contraseña temporal generada",
        data: { email: user.email, passwordTemporal: temporal },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al restablecer la contraseña",
      });
    }
  }
);

export default router;
