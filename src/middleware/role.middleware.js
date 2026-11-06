import { contexto } from "../lib/contexto.js";

const isDev = process.env.NODE_ENV !== "production";

export const checkRole = (roles = []) => {
  return (req, res, next) => {
    try {
      // 🔥 VALIDAR USER
      if (!req.user) {
        return res.status(401).json({
          message: "Usuario no autenticado",
        });
      }

      // 🔥 VALIDAR ROLE
      const userRole =
        req.user.role ||
        req.user.rol ||
        "";

      // 🔥 DEBUG — solo en desarrollo.
      // En producción no se registran datos del usuario en los logs.
      if (isDev) {
        console.log("ROLE ACTUAL:", userRole);
        console.log("ROLES PERMITIDOS:", roles);
      }

      // 🔥 CHECK
      // 👨‍🏫 Un directivo que también da clase (tiene ficha de docente)
      // entra a las rutas de maestro con su misma cuenta.
      const comoDocente = roles.includes("MAESTRO") && Boolean(req.user.docenteId);

      if (!roles.includes(userRole) && !comoDocente) {
        return res.status(403).json({
          message: "Acceso denegado",
        });
      }

      // Entró como maestro: ve sus grupos aunque sean de otro nivel.
      if (!roles.includes(userRole) && comoDocente) {
        const ctx = contexto.getStore();
        if (ctx) ctx.nivel = null;
      }

      next();

    } catch (error) {
      console.error(
        "Error middleware roles:",
        error
      );

      return res.status(500).json({
        message:
          "Error interno de permisos",
      });
    }
  };
};
