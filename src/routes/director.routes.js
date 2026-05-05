import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

// 🔐 middleware global
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

    res.json({
      totalAlumnos,
      totalDocentes,
      totalGrupos,
      totalPagos
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
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
        calificaciones: true
      }
    });

    const data = alumnos.map(a => {
      const califs = a.calificaciones;
      const promedio =
        califs.length > 0
          ? califs.reduce((acc, c) => acc + c.calificacion, 0) / califs.length
          : 0;

      return {
        id: a.id,
        nombre: a.user.name,
        grupo: a.grupo?.nombre || "Sin grupo",
        promedio: promedio.toFixed(1),
        estado: promedio < 8 ? "Seguimiento" : "Activo"
      };
    });

    res.json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
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
          include: { user: true }
        },
        materia: true
      }
    });

    res.json(calificaciones);

  } catch (error) {
    res.status(500).json({ error: error.message });
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
            asistencias: true
          }
        }
      }
    });

    const resultado = grupos.map(g => {
      let asistencias = 0;
      let faltas = 0;

      g.alumnos.forEach(a => {
        a.asistencias.forEach(as => {
          if (as.presente) asistencias++;
          else faltas++;
        });
      });

      const total = asistencias + faltas;
      const porcentaje = total > 0 ? (asistencias / total) * 100 : 0;

      return {
        grupo: g.nombre,
        asistencia: porcentaje.toFixed(1) + "%",
        faltas,
        estatus:
          porcentaje < 90
            ? "Atención"
            : porcentaje < 95
            ? "Estable"
            : "Excelente"
      };
    });

    res.json(resultado);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   👨‍🏫 DOCENTES
========================= */
router.get("/docentes", async (req, res) => {
  try {
    const docentes = await prisma.docente.findMany({
      include: { user: true }
    });

    res.json(docentes);

  } catch (error) {
    res.status(500).json({ error: error.message });
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
          include: { user: true }
        }
      }
    });

    res.json(materias);

  } catch (error) {
    res.status(500).json({ error: error.message });
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
        materias: true
      }
    });

    res.json(grupos);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   📄 REPORTES
========================= */
router.get("/reportes", async (req, res) => {
  try {
    const alumnos = await prisma.alumno.count();
    const pagos = await prisma.pago.aggregate({
      _sum: { monto: true }
    });

    res.json({
      totalAlumnos: alumnos,
      ingresos: pagos._sum.monto || 0
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;