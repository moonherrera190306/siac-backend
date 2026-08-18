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
      if (!roles.includes(userRole)) {
        return res.status(403).json({
          message: "Acceso denegado",
        });
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
