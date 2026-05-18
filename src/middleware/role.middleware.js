export const checkRole = (roles = []) => {
  return (req, res, next) => {
    try {
      // 🔥 DEBUG
      console.log("USER TOKEN:", req.user);

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

      // 🔥 DEBUG
      console.log(
        "ROLE ACTUAL:",
        userRole
      );

      console.log(
        "ROLES PERMITIDOS:",
        roles
      );

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