import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

// 🔐 Middleware global
router.use(verifyToken, checkRole(["DIRECTOR"]));

/* =========================
   🧮 HELPERS
========================= */

function esNumerico(valor) {
  if (valor === null || valor === undefined || valor === "") return false;
  return !isNaN(Number(valor));
}

// Promedio real del kardex: se usa la nota definitiva.
function promedioDeKardex(calificaciones) {
  const numericas = calificaciones
    .map((c) => c.notaDefinitiva)
    .filter(esNumerico)
    .map(Number);

  if (numericas.length === 0) return null;

  return numericas.reduce((acc, n) => acc + n, 0) / numericas.length;
}

/* =========================
   📊 DASHBOARD
========================= */
router.get("/dashboard", async (req, res) => {
  try {
    const [totalAlumnos, totalDocentes, totalGrupos, totalPagos, mensual] =
      await Promise.all([
        prisma.alumno.count({ where: { activo: true } }),
        prisma.docente.count({ where: { activo: true } }),
        prisma.grupo.count({ where: { activo: true } }),
        prisma.pago.count({ where: { estado: "PAGADO" } }),
        prisma.asistenciaMensual.findMany({ select: { porcentaje: true } }),
      ]);

    // 🔥 Ya no es un 92 fijo: sale del acumulado real de asistencia.
    const conDato = mensual.filter((m) => m.porcentaje !== null);

    const asistenciaGlobal =
      conDato.length === 0
        ? null
        : Number(
            (
              conDato.reduce((acc, m) => acc + m.porcentaje, 0) / conDato.length
            ).toFixed(1)
          );

    return res.status(200).json({
      success: true,
      data: {
        totalAlumnos,
        totalDocentes,
        totalGrupos,
        totalPagos,
        asistenciaGlobal,
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
      where: { activo: true },
      include: {
        user: true,
        grupo: true,
        calificaciones: true,
      },
    });

    const data = alumnos.map((a) => {
      // 🔥 Antes leía `c.calificacion`, un campo que no existe:
      // el promedio siempre salía 0 y todos aparecían en seguimiento.
      const promedio = promedioDeKardex(a.calificaciones ?? []);

      return {
        id: a.id,
        nombre: a.user?.name || "Sin nombre",
        grupo: a.grupo?.nombre || "Sin grupo",
        promedio: promedio === null ? null : promedio.toFixed(1),
        estado:
          promedio === null
            ? "Sin calificaciones"
            : promedio < 8
            ? "Seguimiento"
            : "Activo",
      };
    });

    return res.status(200).json({ success: true, data });
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
    const { cicloEscolarId, grupoId } = req.query;

    const calificaciones = await prisma.calificacion.findMany({
      where: {
        ...(cicloEscolarId ? { cicloEscolarId } : {}),
        ...(grupoId ? { alumno: { grupoId } } : {}),
      },
      include: {
        alumno: { include: { user: true, grupo: true } },
        materia: true,
        cicloEscolar: true,
      },
    });

    return res.status(200).json({ success: true, data: calificaciones });
  } catch (error) {
    console.error("ERROR CALIFICACIONES:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Error obteniendo calificaciones",
    });
  }
});

/* =========================
   📅 ASISTENCIAS POR GRUPO
========================= */
router.get("/asistencias", async (req, res) => {
  try {
    const grupos = await prisma.grupo.findMany({
      where: { activo: true },
      include: { alumnos: { select: { id: true } } },
    });

    const resultado = [];

    for (const g of grupos) {
      const ids = g.alumnos.map((a) => a.id);

      // 🔥 Antes leía `as.presente`, un campo inexistente:
      // toda la asistencia se contaba como falta y siempre daba 0%.
      const mensual =
        ids.length === 0
          ? []
          : await prisma.asistenciaMensual.findMany({
              where: { alumnoId: { in: ids } },
            });

      let asistencias = 0;
      let faltas = 0;

      for (const m of mensual) {
        asistencias += m.asisMes1 + m.asisMes2 + m.asisMes3 + m.asisMes4;
        faltas += m.faltasMes1 + m.faltasMes2 + m.faltasMes3 + m.faltasMes4;
      }

      const total = asistencias + faltas;
      const porcentaje = total > 0 ? (asistencias / total) * 100 : null;

      resultado.push({
        grupoId: g.id,
        grupo: g.nombre,
        alumnos: ids.length,
        asistencia: porcentaje === null ? null : porcentaje.toFixed(1) + "%",
        faltas,
        estatus:
          porcentaje === null
            ? "Sin registros"
            : porcentaje < 90
            ? "Atención"
            : porcentaje < 95
            ? "Estable"
            : "Excelente",
      });
    }

    return res.status(200).json({ success: true, data: resultado });
  } catch (error) {
    console.error("ERROR ASISTENCIAS:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Error obteniendo asistencias",
    });
  }
});

/* =========================
   👨‍🏫 DOCENTES
   Cumplimiento real: clases programadas vs. registradas.
========================= */
router.get("/docentes", async (req, res) => {
  try {
    const docentes = await prisma.docente.findMany({
      where: { activo: true },
      include: {
        user: true,
        asignaciones: {
          where: { cicloEscolar: { activo: true } },
          include: { materia: true, grupo: true },
        },
      },
    });

    const data = [];

    for (const d of docentes) {
      const ids = d.asignaciones.map((a) => a.id);

      const [programadas, registradas] = await Promise.all([
        ids.length === 0
          ? 0
          : prisma.clase.count({ where: { asignacionId: { in: ids } } }),
        ids.length === 0
          ? 0
          : prisma.clase.count({
              where: { asignacionId: { in: ids }, registrada: true },
            }),
      ]);

      const cumplimiento =
        programadas === 0 ? null : (registradas / programadas) * 100;

      data.push({
        id: d.id,
        nombre: d.nombre || d.user?.name || "Sin nombre",
        materias: d.asignaciones.map((a) => a.materia?.nombre).filter(Boolean),
        grupos: new Set(d.asignaciones.map((a) => a.grupoId)).size,
        clasesProgramadas: programadas,
        clasesRegistradas: registradas,
        cumplimiento: cumplimiento === null ? null : cumplimiento.toFixed(1) + "%",
      });
    }

    return res.status(200).json({ success: true, data });
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
    // 🔥 Materia no tiene relación directa con Docente:
    // el docente llega a través de AsignacionMateria.
    const materias = await prisma.materia.findMany({
      where: { activo: true },
      include: {
        asignaciones: {
          where: { cicloEscolar: { activo: true } },
          include: { docente: { include: { user: true } } },
        },
        calificaciones: {
          where: { cicloEscolar: { activo: true } },
          select: { notaDefinitiva: true },
        },
      },
    });

    const data = materias.map((m) => {
      const promedio = promedioDeKardex(m.calificaciones ?? []);

      return {
        id: m.id,
        clave: m.clave,
        nombre: m.nombre,
        tipo: m.tipo,
        docentes: m.asignaciones
          .map((a) => a.docente?.nombre || a.docente?.user?.name)
          .filter(Boolean),
        promedio: promedio === null ? null : promedio.toFixed(1),
        estatus:
          promedio === null ? "Sin datos" : promedio < 7 ? "Atención" : "Estable",
      };
    });

    return res.status(200).json({ success: true, data });
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
    // 🔥 Grupo no tiene relación `materias`: llegan por asignaciones.
    const grupos = await prisma.grupo.findMany({
      include: {
        alumnos: { include: { user: true } },
        turno: true,
        semestre: true,
        asignaciones: {
          include: {
            materia: true,
            docente: { include: { user: true } },
          },
        },
      },
    });

    return res.status(200).json({ success: true, data: grupos });
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
    const [alumnos, pagos] = await Promise.all([
      prisma.alumno.count({ where: { activo: true } }),
      // 🔥 El campo ya no es `monto` sino `total`, y los cancelados no cuentan.
      prisma.pago.aggregate({
        where: { estado: "PAGADO" },
        _sum: { total: true },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalAlumnos: alumnos,
        ingresos: pagos?._sum?.total || 0,
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
