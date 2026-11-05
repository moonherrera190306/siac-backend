import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { contexto } from "../lib/contexto.js";

export const COOKIE_TOKEN = "siac_token";

/**
 * Lee una cookie sin depender de cookie-parser.
 */
function leerCookie(req, nombre) {
  const crudo = req.headers.cookie;

  if (!crudo) return null;

  for (const parte of crudo.split(";")) {
    const [clave, ...resto] = parte.trim().split("=");

    if (clave === nombre) return decodeURIComponent(resto.join("="));
  }

  return null;
}

/**
 * 🔐 El token viaja en una cookie httpOnly, no en localStorage:
 * así un XSS no puede leerlo.
 *
 * El header Authorization se sigue aceptando para clientes que no
 * son el navegador (Postman, scripts, integraciones).
 */
export const verifyToken = async (req, res, next) => {
  try {
    let token = leerCookie(req, COOKIE_TOKEN);

    if (!token) {
      const authHeader = req.headers.authorization;

      // 🔥 Antes hacía split(" ")[1] sin comprobar el esquema.
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
      }
    }

    if (!token) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔒 Un token sigue siendo válido aunque la cuenta se haya desactivado:
    // hay que comprobarlo contra la base.
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        activo: true,
        role: true,
        name: true,
        nivelAcademico: { select: { clave: true } },
      },
    });

    if (!user || !user.activo) {
      return res.status(401).json({ message: "Cuenta desactivada" });
    }

    // `name` se usa, por ejemplo, para las iniciales del cajero en el recibo.
    req.user = { ...decoded, role: user.role, name: user.name };

    // 🏫 Dirección y Secretaría con nivel solo ven ese nivel: el filtro
    // lo aplica lib/prisma.js en cada consulta de esta petición.
    const nivel = ["DIRECTOR", "SECRETARIA"].includes(user.role)
      ? user.nivelAcademico?.clave ?? null
      : null;

    contexto.run({ nivel }, next);
  } catch (error) {
    return res.status(401).json({ message: "Token inválido" });
  }
};
