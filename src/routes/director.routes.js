import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

// 🔐 Middleware global
router.use(verifyToken, checkRole(["DIRECTOR"]));

/* =========================
   📊 DASHBOARD
========================= */
router.get("/dashboard", async (req, res) => {
  try {
    const totalAlumnos = await prisma.alumno.count();
    const totalDocentes = await prisma.docente.count();
    const totalGrupos = await prisma.grupo.count();
    const totalPagos = await prisma.pago.count();

    return res.status(200).json({
      success: true,
      data: {
        totalAlumnos,
        totalDocentes,
        totalGrupos,
        totalPagos,
        asistenciaGlobal: 92,
      },
    });
  } catch (error) {
    console.error("ERROR DASHBOARD:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Error obteniendo dashboard",
    });
  }
});

/* =========================
   👨‍🎓 ALUMNOS
========================= */
router.get("/alumnos", async (req, res) => {
  try {
    const alumnos = await prisma.alumno.findMany({
      include: {
        user: true,
        grupo: true,
        calificaciones: true,
      },
    });

    const data = alumnos.map((a) => {
      const califs = Array.isArray(a.calificaciones)
        ? a.calificaciones
        : [];

      const promedio =
        califs.length > 0
          ? califs.reduce(
              (acc, c) => acc + (c.calificacion || 0),
              0
            ) / califs.length
          : 0;

      return {
        id: a.id,
        nombre: a.user?.name || "Sin nombre",
        grupo: a.grupo?.nombre || "Sin grupo",
        promedio: promedio.toFixed(1),
        estado: promedio < 8 ? "Seguimiento" : "Activo",
      };
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("ERROR ALUMNOS:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Error obteniendo alumnos",
    });
  }
});

/* =========================
   📊 CALIFICACIONES
========================= */
router.get("/calificaciones", async (req, res) => {
  try {
    const calificaciones = await prisma.calificacion.findMany({
      include: {
        alumno: {
          include: {
            user: true,
          },
        },
        materia: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: calificaciones,
    });
  } catch (error) {
    console.error("ERROR CALIFICACIONES:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message || "Error obteniendo calificaciones",
    });
  }
});

/* =========================
   📅 ASISTENCIAS
========================= */
router.get("/asistencias", async (req, res) => {
  try {
    const grupos = await prisma.grupo.findMany({
      include: {
        alumnos: {
          include: {
            asistencias: true,
          },
        },
      },
    });

    const resultado = grupos.map((g) => {
      let asistencias = 0;
      let faltas = 0;

      (g.alumnos ?? []).forEach((a) => {
        (a.asistencias ?? []).forEach((as) => {
          if (as.presente) {
            asistencias++;
          } else {
            faltas++;
          }
        });
      });

      const total = asistencias + faltas;

      const porcentaje =
        total > 0 ? (asistencias / total) * 100 : 0;

      return {
        grupo: g.nombre,
        asistencia: porcentaje.toFixed(1) + "%",
        faltas,
        estatus:
          porcentaje < 90
            ? "Atención"
            : porcentaje < 95
            ? "Estable"
            : "Excelente",
      };
    });

    return res.status(200).json({
      success: true,
      data: resultado,
    });
  } catch (error) {
    console.error("ERROR ASISTENCIAS:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message || "Error obteniendo asistencias",
    });
  }
});

/* =========================
   👨‍🏫 DOCENTES
========================= */
router.get("/docentes", async (req, res) => {
  try {
    const docentes = await prisma.docente.findMany({
      include: {
        user: true,
      },
    });

    const data = docentes.map((d) => ({
      id: d.id,
      nombre: d.user?.name || "Sin nombre",
      materia: "Sin materia",
      grupos: 0,
      desempeño: "Bueno",
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("ERROR DOCENTES:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Error obteniendo docentes",
    });
  }
});

/* =========================
   📚 MATERIAS
========================= */
router.get("/materias", async (req, res) => {
  try {
    const materias = await prisma.materia.findMany({
      include: {
        docente: {
          include: {
            user: true,
          },
        },
      },
    });

    const data = materias.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      docente:
        m.docente?.user?.name || "Sin docente",
      promedio: 85,
      estatus: "Estable",
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("ERROR MATERIAS:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Error obteniendo materias",
    });
  }
});

/* =========================
   👥 GRUPOS
========================= */
router.get("/grupos", async (req, res) => {
  try {
    const grupos = await prisma.grupo.findMany({
      include: {
        alumnos: true,
        materias: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: grupos,
    });
  } catch (error) {
    console.error("ERROR GRUPOS:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Error obteniendo grupos",
    });
  }
});

/* =========================
   📄 REPORTES
========================= */
router.get("/reportes", async (req, res) => {
  try {
    const alumnos = await prisma.alumno.count();

    const pagos = await prisma.pago.aggregate({
      _sum: {
        monto: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        totalAlumnos: alumnos,
        ingresos: pagos?._sum?.monto || 0,
      },
    });
  } catch (error) {
    console.error("ERROR REPORTES:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Error obteniendo reportes",
    });
  }
});

export default router;