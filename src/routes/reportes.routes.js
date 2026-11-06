import express from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { aCSV } from "../lib/csv.js";
import { reportePDF } from "../lib/pdf.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { contexto as peticion, clavesDe } from "../lib/contexto.js";

const router = express.Router();

/**
 * 📊 REPORTES
 *
 * Antes este archivo devolvía volcados crudos de tabla que ninguna
 * pantalla renderizaba, y duplicaba la lógica de otros módulos sin
 * sus controles de acceso.
 *
 * Ahora cada endpoint responde una pregunta concreta de la dirección
 * y acepta `?formato=csv` para descargarse.
 */

const MINIMA = 6;

function esNumerico(v) {
  return v !== null && v !== undefined && v !== "" && !isNaN(Number(v));
}

/**
 * Resume el `meta` del reporte en una línea legible bajo el título del PDF.
 */
function contexto(meta = {}) {
  const partes = [];

  if (meta.ciclo) partes.push(`Ciclo ${meta.ciclo}`);
  if (meta.revisados !== undefined) partes.push(`${meta.revisados} alumnos revisados`);
  if (meta.recibos !== undefined) partes.push(`${meta.recibos} recibos`);
  if (meta.total !== undefined && meta.total !== null) {
    partes.push(`Total $${Number(meta.total).toFixed(2)}`);
  }

  return partes.join(" · ");
}

function responder(req, res, { nombre, titulo, filas, columnas, meta }) {
  if (req.query.formato === "pdf") {
    return reportePDF(res, {
      nombreArchivo: nombre,
      titulo: titulo || nombre,
      subtitulo: contexto(meta),
      columnas,
      filas,
      horizontal: columnas.length > 6,
    });
  }

  if (req.query.formato === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nombre}.csv"`
    );

    return res.send(aCSV(filas, columnas));
  }

  return res.json({ success: true, data: filas, columnas, meta });
}

/**
 * COUNT y SUM en Postgres regresan BigInt: JSON.stringify truena con ellos.
 */
function num(valor) {
  return valor === null || valor === undefined ? null : Number(valor);
}

/**
 * La nota definitiva se guarda como texto (acepta AC, NA, NP).
 * Solo las numéricas entran al promedio.
 */
const NOTA_NUMERICA = Prisma.sql`c."notaDefinitiva" ~ '^[0-9]+(\\.[0-9]+)?$'`;

/**
 * Asistencia acumulada por alumno. Va en consulta aparte a propósito:
 * unir Calificacion y AsistenciaMensual en el mismo GROUP BY multiplica
 * las filas y falsea los promedios.
 */
async function asistenciaPorAlumno(cicloId) {
  const filas = await prisma.$queryRaw`
    SELECT m."alumnoId" AS id,
           AVG(m.porcentaje) AS asistencia
    FROM "AsistenciaMensual" m
    WHERE m.porcentaje IS NOT NULL
      ${cicloId ? Prisma.sql`AND m."cicloEscolarId" = ${cicloId}` : Prisma.empty}
    GROUP BY m."alumnoId"
  `;

  return new Map(filas.map((f) => [f.id, num(f.asistencia)]));
}

/**
 * 🏫 Las consultas en SQL crudo no pasan por el filtro de lib/prisma.js:
 * si el usuario tiene nivel, se limita aquí a los grupos de ese nivel.
 */
function soloGruposDelNivel(columna) {
  const nivel = peticion.getStore()?.nivel;
  if (!nivel) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.raw(columna)} IN (
    SELECT g2.id FROM "Grupo" g2
    JOIN "Semestre" s2 ON s2.id = g2."semestreId"
    JOIN "Carrera" ca2 ON ca2.id = s2."carreraId"
    JOIN "Programa" p2 ON p2.id = ca2."programaId"
    JOIN "NivelAcademico" n2 ON n2.id = p2."nivelAcademicoId"
    WHERE n2.clave IN (${Prisma.join(clavesDe(nivel))}))`;
}

async function cicloDe(req) {
  return req.query.cicloEscolarId
    ? prisma.cicloEscolar.findUnique({ where: { id: req.query.cicloEscolarId } })
    : prisma.cicloEscolar.findFirst({ where: { activo: true } });
}

/* =========================================
   ⚠️ ALUMNOS EN RIESGO
   Reprobadas, promedio bajo o asistencia baja.
========================================= */
router.get(
  "/riesgo",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const ciclo = await cicloDe(req);
      const cicloId = ciclo?.id ?? null;

      // 🔥 Antes esto cargaba TODOS los alumnos con TODAS sus
      // calificaciones y asistencias en memoria y las recorría en JS.
      // Ahora la base agrega y devuelve una fila por alumno.
      const filasSQL = await prisma.$queryRaw`
        SELECT a.id,
               a.matricula,
               u.name AS alumno,
               COALESCE(g.nombre, 'Sin grupo') AS grupo,
               AVG(CASE WHEN ${NOTA_NUMERICA}
                        THEN c."notaDefinitiva"::numeric END) AS promedio,
               COUNT(c.id) FILTER (
                 WHERE c.estatus::text = 'REPROBADA'
               ) AS reprobadas
        FROM "Alumno" a
        JOIN "User" u ON u.id = a."userId"
        LEFT JOIN "Grupo" g ON g.id = a."grupoId"
        LEFT JOIN "Calificacion" c
          ON c."alumnoId" = a.id
          ${cicloId ? Prisma.sql`AND c."cicloEscolarId" = ${cicloId}` : Prisma.empty}
        WHERE a.activo = true
          ${soloGruposDelNivel('a."grupoId"')}
        GROUP BY a.id, a.matricula, u.name, g.nombre
      `;

      const asistencias = await asistenciaPorAlumno(cicloId);

      const filas = [];

      for (const f of filasSQL) {
        const promedio = num(f.promedio);
        const reprobadas = num(f.reprobadas) ?? 0;
        const asistencia = asistencias.get(f.id) ?? null;

        const motivos = [];

        if (reprobadas > 0) motivos.push(`${reprobadas} materia(s) reprobada(s)`);

        if (promedio !== null && promedio < 7) {
          motivos.push(`promedio ${promedio.toFixed(1)}`);
        }

        if (asistencia !== null && asistencia < 80) {
          motivos.push(`asistencia ${asistencia.toFixed(1)}%`);
        }

        if (motivos.length === 0) continue;

        filas.push({
          matricula: f.matricula,
          alumno: f.alumno ?? "",
          grupo: f.grupo,
          promedio: promedio === null ? "" : promedio.toFixed(1),
          reprobadas,
          asistencia: asistencia === null ? "" : asistencia.toFixed(1),
          nivel:
            reprobadas >= 3 || (asistencia !== null && asistencia < 70)
              ? "CRITICO"
              : reprobadas > 0
              ? "ALTO"
              : "MEDIO",
          motivos: motivos.join("; "),
        });
      }

      filas.sort((a, b) => b.reprobadas - a.reprobadas);

      responder(req, res, {
        nombre: "alumnos-en-riesgo",
        titulo: "Alumnos en riesgo",
        filas,
        columnas: [
          { id: "matricula", label: "Matrícula" },
          { id: "alumno", label: "Alumno" },
          { id: "grupo", label: "Grupo" },
          { id: "promedio", label: "Promedio" },
          { id: "reprobadas", label: "Reprobadas" },
          { id: "asistencia", label: "Asistencia %" },
          { id: "nivel", label: "Nivel" },
          { id: "motivos", label: "Motivos" },
        ],
        meta: {
          ciclo: ciclo?.nombre ?? null,
          total: filas.length,
          revisados: filasSQL.length,
        },
      });
    } catch (error) {
      console.error("ERROR REPORTE RIESGO:", error);

      res.status(500).json({
        success: false,
        message: "Error al generar el reporte de riesgo",
      });
    }
  }
);

/* =========================================
   📈 PROMEDIO Y APROBACIÓN POR GRUPO
========================================= */
router.get(
  "/grupos",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const ciclo = await cicloDe(req);
      const cicloId = ciclo?.id ?? null;

      // Académico y asistencia se agregan por separado: unirlos en un
      // solo GROUP BY multiplica filas y falsea los dos promedios.
      const academico = await prisma.$queryRaw`
        SELECT g.id,
               g.nombre AS grupo,
               COALESCE(s.nombre, '') AS semestre,
               COALESCE(t.nombre, '') AS turno,
               COUNT(DISTINCT a.id) AS alumnos,
               AVG(CASE WHEN ${NOTA_NUMERICA}
                        THEN c."notaDefinitiva"::numeric END) AS promedio,
               COUNT(c.id) FILTER (WHERE c.estatus::text = 'APROBADA') AS aprobadas,
               COUNT(c.id) FILTER (WHERE c.estatus::text = 'REPROBADA') AS reprobadas
        FROM "Grupo" g
        LEFT JOIN "Semestre" s ON s.id = g."semestreId"
        LEFT JOIN "Turno" t ON t.id = g."turnoId"
        LEFT JOIN "Alumno" a ON a."grupoId" = g.id AND a.activo = true
        LEFT JOIN "Calificacion" c
          ON c."alumnoId" = a.id
          ${cicloId ? Prisma.sql`AND c."cicloEscolarId" = ${cicloId}` : Prisma.empty}
        WHERE g.activo = true
          ${soloGruposDelNivel("g.id")}
        GROUP BY g.id, g.nombre, s.nombre, t.nombre
        ORDER BY g.nombre ASC
      `;

      const asistencia = await prisma.$queryRaw`
        SELECT a."grupoId" AS id,
               AVG(m.porcentaje) AS asistencia
        FROM "AsistenciaMensual" m
        JOIN "Alumno" a ON a.id = m."alumnoId"
        WHERE m.porcentaje IS NOT NULL
          AND a."grupoId" IS NOT NULL
          ${cicloId ? Prisma.sql`AND m."cicloEscolarId" = ${cicloId}` : Prisma.empty}
        GROUP BY a."grupoId"
      `;

      const porGrupo = new Map(
        asistencia.map((f) => [f.id, num(f.asistencia)])
      );

      const filas = academico.map((g) => {
        const promedio = num(g.promedio);
        const aprobadas = num(g.aprobadas) ?? 0;
        const reprobadas = num(g.reprobadas) ?? 0;
        const evaluadas = aprobadas + reprobadas;
        const asis = porGrupo.get(g.id) ?? null;

        return {
          grupo: g.grupo,
          semestre: g.semestre,
          turno: g.turno,
          alumnos: num(g.alumnos) ?? 0,
          promedio: promedio === null ? "" : promedio.toFixed(1),
          aprobacion:
            evaluadas === 0 ? "" : ((aprobadas / evaluadas) * 100).toFixed(1),
          reprobadas,
          asistencia: asis === null ? "" : asis.toFixed(1),
        };
      });

      responder(req, res, {
        nombre: "reporte-por-grupo",
        titulo: "Desempeño por grupo",
        filas,
        columnas: [
          { id: "grupo", label: "Grupo" },
          { id: "semestre", label: "Semestre" },
          { id: "turno", label: "Turno" },
          { id: "alumnos", label: "Alumnos" },
          { id: "promedio", label: "Promedio" },
          { id: "aprobacion", label: "Aprobación %" },
          { id: "reprobadas", label: "Reprobadas" },
          { id: "asistencia", label: "Asistencia %" },
        ],
        meta: { ciclo: ciclo?.nombre ?? null, total: filas.length },
      });
    } catch (error) {
      console.error("ERROR REPORTE GRUPOS:", error);

      res.status(500).json({
        success: false,
        message: "Error al generar el reporte por grupo",
      });
    }
  }
);

/* =========================================
   💰 INGRESOS
========================================= */
router.get(
  "/ingresos",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "CAJA"]),
  async (req, res) => {
    try {
      const desde = req.query.desde ? new Date(req.query.desde) : null;
      const hasta = req.query.hasta ? new Date(req.query.hasta) : null;

      if (hasta) hasta.setHours(23, 59, 59, 999);

      const pagos = await prisma.pago.findMany({
        where: {
          estado: "PAGADO",
          ...(desde || hasta
            ? {
                pagadoEn: {
                  ...(desde ? { gte: desde } : {}),
                  ...(hasta ? { lte: hasta } : {}),
                },
              }
            : {}),
        },
        include: { detalles: { include: { concepto: true } } },
      });

      const porConcepto = new Map();

      let total = 0;

      for (const p of pagos) {
        for (const d of p.detalles) {
          const clave = d.concepto?.nombre ?? "Sin concepto";
          const importe = d.monto * d.cantidad;

          porConcepto.set(clave, (porConcepto.get(clave) ?? 0) + importe);

          total += importe;
        }
      }

      const filas = Array.from(porConcepto.entries())
        .map(([concepto, importe]) => ({
          concepto,
          importe: importe.toFixed(2),
          porcentaje: total > 0 ? ((importe / total) * 100).toFixed(1) : "0.0",
        }))
        .sort((a, b) => Number(b.importe) - Number(a.importe));

      // Los cancelados no cuentan, pero conviene saber cuántos hubo.
      const cancelados = await prisma.pago.count({
        where: { estado: "CANCELADO" },
      });

      responder(req, res, {
        nombre: "ingresos",
        titulo: "Ingresos por concepto",
        filas,
        columnas: [
          { id: "concepto", label: "Concepto" },
          { id: "importe", label: "Importe" },
          { id: "porcentaje", label: "%" },
        ],
        meta: {
          total: Number(total.toFixed(2)),
          recibos: pagos.length,
          cancelados,
          desde,
          hasta,
        },
      });
    } catch (error) {
      console.error("ERROR REPORTE INGRESOS:", error);

      res.status(500).json({
        success: false,
        message: "Error al generar el reporte de ingresos",
      });
    }
  }
);

/* =========================================
   👥 PADRÓN DE ALUMNOS
========================================= */
router.get(
  "/alumnos",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const alumnos = await prisma.alumno.findMany({
        where: req.query.activos === "false" ? {} : { activo: true },
        include: {
          user: true,
          grupo: true,
          carrera: true,
          programa: true,
          trayectoria: true,
        },
        orderBy: { matricula: "asc" },
      });

      const filas = alumnos.map((a) => ({
        matricula: a.matricula,
        alumno: a.user?.name ?? "",
        correo: a.user?.email ?? "",
        curp: a.curp ?? "",
        programa: a.programa?.nombre ?? "",
        carrera: a.carrera?.nombre ?? "",
        grupo: a.grupo?.nombre ?? "",
        trayectoria: a.trayectoria?.nombre ?? "",
        estatus: a.estatusAcademico,
      }));

      responder(req, res, {
        nombre: "padron-alumnos",
        titulo: "Padrón de alumnos",
        filas,
        columnas: [
          { id: "matricula", label: "Matrícula" },
          { id: "alumno", label: "Alumno" },
          { id: "correo", label: "Correo" },
          { id: "curp", label: "CURP" },
          { id: "programa", label: "Programa" },
          { id: "carrera", label: "Carrera" },
          { id: "grupo", label: "Grupo" },
          { id: "trayectoria", label: "Trayectoria" },
          { id: "estatus", label: "Estatus" },
        ],
        meta: { total: filas.length },
      });
    } catch (error) {
      console.error("ERROR PADRÓN:", error);

      res.status(500).json({
        success: false,
        message: "Error al generar el padrón",
      });
    }
  }
);

export default router;
