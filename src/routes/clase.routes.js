import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();

/**
 * 📆 CLASES — programadas vs. impartidas
 *
 * `Horario` dice cuándo DEBE haber clase. `Clase` es cada sesión concreta.
 * Al generar las clases del ciclo a partir de los horarios, una clase que
 * nadie registró queda con `registrada = false`, y esa diferencia es todo
 * el reporte de cumplimiento docente.
 */

// getUTCDay: 0 domingo … 6 sábado
const DIA_POR_INDICE = {
  1: "LUNES",
  2: "MARTES",
  3: "MIERCOLES",
  4: "JUEVES",
  5: "VIERNES",
  6: "SABADO",
};

// Se trabaja en UTC a medianoche para que la fecha no se recorra un día
// según la zona horaria de quien consulta.
function aFechaUTC(valor) {
  const d = new Date(valor);

  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

/* =========================================
   ⚙️ GENERAR LAS CLASES DEL CICLO
   A partir de los horarios y del rango de fechas.
========================================= */
router.post(
  "/generar",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { cicloEscolarId, desde, hasta } = req.body;

      const ciclo = cicloEscolarId
        ? await prisma.cicloEscolar.findUnique({ where: { id: cicloEscolarId } })
        : await prisma.cicloEscolar.findFirst({ where: { activo: true } });

      if (!ciclo) {
        return res.status(400).json({
          success: false,
          message: "No hay un ciclo escolar seleccionado ni activo",
        });
      }

      const inicio = aFechaUTC(desde || ciclo.fechaInicio);
      const fin = aFechaUTC(hasta || ciclo.fechaFin);

      if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
        return res.status(400).json({
          success: false,
          message:
            "El ciclo no tiene fechas y no se recibió un rango: indica desde y hasta",
        });
      }

      if (fin < inicio) {
        return res.status(400).json({
          success: false,
          message: "La fecha final debe ser posterior a la inicial",
        });
      }

      // 🔒 Un ciclo largo con muchos horarios puede generar decenas de
      // miles de filas: se acota el rango para no tumbar la base.
      const dias = Math.round((fin - inicio) / 86400000) + 1;

      if (dias > 400) {
        return res.status(400).json({
          success: false,
          message: "El rango no puede ser mayor a 400 días",
        });
      }

      const horarios = await prisma.horario.findMany({
        where: { asignacion: { cicloEscolarId: ciclo.id } },
        select: { id: true, asignacionId: true, dia: true },
      });

      if (horarios.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No hay horarios capturados en este ciclo. Captúralos antes de generar las clases.",
        });
      }

      const porDia = {};

      for (const h of horarios) {
        (porDia[h.dia] ??= []).push(h);
      }

      const nuevas = [];

      for (let f = new Date(inicio); f <= fin; f.setUTCDate(f.getUTCDate() + 1)) {
        const dia = DIA_POR_INDICE[f.getUTCDay()];

        if (!dia || !porDia[dia]) continue;

        for (const h of porDia[dia]) {
          nuevas.push({
            asignacionId: h.asignacionId,
            horarioId: h.id,
            fecha: new Date(f),
            registrada: false,
          });
        }
      }

      // skipDuplicates se apoya en @@unique([asignacionId, fecha, horarioId]):
      // volver a generar el mismo rango no duplica nada.
      const resultado = await prisma.clase.createMany({
        data: nuevas,
        skipDuplicates: true,
      });

      res.json({
        success: true,
        message: `${resultado.count} clase(s) programada(s)`,
        data: {
          ciclo: ciclo.nombre,
          desde: inicio,
          hasta: fin,
          candidatas: nuevas.length,
          creadas: resultado.count,
        },
      });
    } catch (error) {
      console.error("ERROR GENERANDO CLASES:", error);

      res.status(500).json({
        success: false,
        message: "Error al generar las clases",
      });
    }
  }
);

/* =========================================
   📊 CUMPLIMIENTO DOCENTE
   Clases programadas vs. clases registradas.
========================================= */
router.get(
  "/cumplimiento",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const ciclo = req.query.cicloEscolarId
        ? await prisma.cicloEscolar.findUnique({
            where: { id: req.query.cicloEscolarId },
          })
        : await prisma.cicloEscolar.findFirst({ where: { activo: true } });

      if (!ciclo) {
        return res.json({ success: true, data: [], meta: { ciclo: null } });
      }

      // Por defecto solo hasta hoy: contar como incumplidas las clases
      // que todavía no han ocurrido sería injusto y falso.
      const hasta = aFechaUTC(req.query.hasta || new Date());

      const clases = await prisma.clase.findMany({
        where: {
          fecha: { lte: hasta },
          asignacion: { cicloEscolarId: ciclo.id },
        },
        include: {
          asignacion: {
            include: {
              materia: true,
              grupo: true,
              docente: { include: { user: true } },
            },
          },
        },
      });

      const porDocente = new Map();

      for (const c of clases) {
        const d = c.asignacion.docente;
        const id = d?.id ?? "sin-docente";

        if (!porDocente.has(id)) {
          porDocente.set(id, {
            docenteId: id,
            nombre: d?.nombre || d?.user?.name || "Sin docente",
            programadas: 0,
            registradas: 0,
            conIncidencias: 0,
            materias: new Set(),
          });
        }

        const acc = porDocente.get(id);

        acc.programadas += 1;

        if (c.registrada) acc.registradas += 1;

        if (c.incidencias && c.incidencias.trim()) acc.conIncidencias += 1;

        if (c.asignacion.materia?.nombre) {
          acc.materias.add(c.asignacion.materia.nombre);
        }
      }

      const data = Array.from(porDocente.values())
        .map((d) => ({
          ...d,
          materias: Array.from(d.materias),
          pendientes: d.programadas - d.registradas,
          cumplimiento:
            d.programadas === 0
              ? null
              : Number(((d.registradas / d.programadas) * 100).toFixed(1)),
        }))
        .sort((a, b) => (a.cumplimiento ?? 101) - (b.cumplimiento ?? 101));

      res.json({
        success: true,
        data,
        meta: {
          ciclo: ciclo.nombre,
          hasta,
          totalProgramadas: clases.length,
          totalRegistradas: clases.filter((c) => c.registrada).length,
        },
      });
    } catch (error) {
      console.error("ERROR CUMPLIMIENTO:", error);

      res.status(500).json({
        success: false,
        message: "Error al calcular el cumplimiento",
      });
    }
  }
);

/* =========================================
   📓 BITÁCORA
   Lo que realmente se dio en clase.
========================================= */
router.get(
  "/bitacora",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(200, Number(req.query.perPage) || 50);

      const where = {
        ...(req.query.soloRegistradas === "false"
          ? {}
          : { registrada: true }),
        ...(req.query.conIncidencias === "true"
          ? { NOT: { incidencias: null } }
          : {}),
        asignacion: {
          ...(req.query.docenteId ? { docenteId: req.query.docenteId } : {}),
          ...(req.query.grupoId ? { grupoId: req.query.grupoId } : {}),
          ...(req.query.materiaId ? { materiaId: req.query.materiaId } : {}),
          ...(req.query.cicloEscolarId
            ? { cicloEscolarId: req.query.cicloEscolarId }
            : { cicloEscolar: { activo: true } }),
        },
      };

      const [clases, total] = await Promise.all([
        prisma.clase.findMany({
          where,
          include: {
            asignacion: {
              include: {
                materia: true,
                grupo: true,
                docente: { include: { user: true } },
              },
            },
            _count: { select: { asistencias: true } },
          },
          orderBy: { fecha: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.clase.count({ where }),
      ]);

      res.json({
        success: true,
        data: clases,
        meta: { page, perPage, total },
      });
    } catch (error) {
      console.error("ERROR BITÁCORA:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener la bitácora",
      });
    }
  }
);

export default router;
