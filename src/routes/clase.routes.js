import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import {
  ahoraEscolar,
  estadoVentana,
  TOLERANCIA_MINUTOS,
} from "../lib/tolerancia.js";

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
   🕘 MIS CLASES DE HOY (BITÁCORA DEL DOCENTE)
   Cada hora programada de hoy con su ventana de registro:
   cuándo abre, cuánto le queda y si ya la registró.
========================================= */
router.get(
  "/hoy",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const ahora = ahoraEscolar();

      let docenteId = req.query.docenteId || null;

      if (req.user.role === "MAESTRO") {
        const docente = await prisma.docente.findUnique({
          where: { userId: req.user.id },
        });

        if (!docente) {
          return res.status(403).json({
            success: false,
            message: "Tu usuario no está ligado a un expediente de docente",
          });
        }

        docenteId = docente.id;
      }

      const horarios = await prisma.horario.findMany({
        where: {
          dia: ahora.dia,
          asignacion: {
            ...(docenteId ? { docenteId } : {}),
            cicloEscolar: { activo: true },
          },
        },
        include: {
          asignacion: {
            include: {
              materia: true,
              grupo: { include: { _count: { select: { alumnos: true } } } },
              docente: { include: { user: true } },
            },
          },
        },
        orderBy: { horaInicio: "asc" },
      });

      const desde = new Date(`${ahora.fechaISO}T00:00:00.000Z`);
      const hasta = new Date(`${ahora.fechaISO}T23:59:59.999Z`);

      const clasesHoy = await prisma.clase.findMany({
        where: {
          fecha: { gte: desde, lte: hasta },
          asignacionId: { in: horarios.map((h) => h.asignacionId) },
        },
        include: { _count: { select: { asistencias: true } } },
      });

      const data = horarios.map((h) => {
        const ventana = estadoVentana(h.horaInicio, ahora);

        const clase = clasesHoy.find(
          (c) => c.horarioId === h.id || c.asignacionId === h.asignacionId
        );

        const registrada = Boolean(clase?.registrada);

        return {
          horarioId: h.id,
          asignacionId: h.asignacionId,
          materia: h.asignacion.materia?.nombre ?? "",
          grupo: h.asignacion.grupo?.nombre ?? "",
          alumnos: h.asignacion.grupo?._count?.alumnos ?? 0,
          docente:
            h.asignacion.docente?.nombre ||
            h.asignacion.docente?.user?.name ||
            "",
          aula: h.aula || h.asignacion.aula || null,
          horaInicio: h.horaInicio,
          horaFin: h.horaFin,
          cierraA: ventana.cierraA ?? null,
          // ABIERTA = puede registrar ahora mismo.
          estado: registrada ? "REGISTRADA" : ventana.estado,
          abreEn: ventana.abreEn ?? null,
          restan: ventana.restan ?? null,
          minutosRetardo: registrada ? clase?.minutosRetardo ?? null : null,
          tema: clase?.tema ?? null,
          asistenciasCapturadas: clase?._count?.asistencias ?? 0,
        };
      });

      res.json({
        success: true,
        data,
        meta: {
          fecha: ahora.fechaISO,
          dia: ahora.dia,
          hora: ahora.hora,
          toleranciaMinutos: TOLERANCIA_MINUTOS,
        },
      });
    } catch (error) {
      console.error("ERROR CLASES DE HOY:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener tus clases de hoy",
      });
    }
  }
);

/* =========================================
   ✅ REGISTRO DEL DÍA (DIRECCIÓN)
   Quién ya registró su clase, quién llegó tarde y quién no registró.
========================================= */
router.get(
  "/registro-dia",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const ahora = ahoraEscolar();

      const fechaISO = req.query.fecha || ahora.fechaISO;

      // El día de la semana de la fecha consultada, no el de hoy.
      const indice = new Date(`${fechaISO}T12:00:00Z`).getUTCDay();

      const dia = [
        "DOMINGO",
        "LUNES",
        "MARTES",
        "MIERCOLES",
        "JUEVES",
        "VIERNES",
        "SABADO",
      ][indice];

      const horarios = await prisma.horario.findMany({
        where: {
          dia,
          asignacion: { cicloEscolar: { activo: true } },
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
        orderBy: { horaInicio: "asc" },
      });

      const desde = new Date(`${fechaISO}T00:00:00.000Z`);
      const hasta = new Date(`${fechaISO}T23:59:59.999Z`);

      const clases = await prisma.clase.findMany({
        where: {
          fecha: { gte: desde, lte: hasta },
          asignacionId: { in: horarios.map((h) => h.asignacionId) },
        },
        include: { _count: { select: { asistencias: true } } },
      });

      const esHoy = fechaISO === ahora.fechaISO;

      const data = horarios.map((h) => {
        const clase = clases.find(
          (c) => c.horarioId === h.id || c.asignacionId === h.asignacionId
        );

        const ventana = estadoVentana(h.horaInicio, ahora);

        let estado;

        if (clase?.registrada) {
          estado = clase.minutosRetardo > 0 ? "REGISTRADA_TARDE" : "REGISTRADA";
        } else if (esHoy && ventana.estado !== "VENCIDA") {
          estado = "EN_TIEMPO"; // todavía puede registrarla
        } else {
          estado = "SIN_REGISTRO";
        }

        return {
          horarioId: h.id,
          docenteId: h.asignacion.docenteId,
          docente:
            h.asignacion.docente?.nombre ||
            h.asignacion.docente?.user?.name ||
            "Sin docente",
          materia: h.asignacion.materia?.nombre ?? "",
          grupo: h.asignacion.grupo?.nombre ?? "",
          horaInicio: h.horaInicio,
          horaFin: h.horaFin,
          aula: h.aula || h.asignacion.aula || null,
          estado,
          registradaEn: clase?.registradaEn ?? null,
          minutosRetardo: clase?.minutosRetardo ?? null,
          tema: clase?.tema ?? null,
          incidencias: clase?.incidencias ?? null,
          alumnos: clase?._count?.asistencias ?? 0,
        };
      });

      res.json({
        success: true,
        data,
        meta: {
          fecha: fechaISO,
          dia,
          hora: ahora.hora,
          toleranciaMinutos: TOLERANCIA_MINUTOS,
          programadas: data.length,
          registradas: data.filter((d) => d.estado.startsWith("REGISTRADA"))
            .length,
          tarde: data.filter((d) => d.estado === "REGISTRADA_TARDE").length,
          sinRegistro: data.filter((d) => d.estado === "SIN_REGISTRO").length,
        },
      });
    } catch (error) {
      console.error("ERROR REGISTRO DEL DÍA:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener el registro del día",
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
