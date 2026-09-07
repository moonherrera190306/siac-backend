import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { auditarLote } from "../lib/audit.js";
import {
  COLUMNAS,
  calcularEstatus,
  calcularNotaDefinitiva,
  calcularPromedio,
  normalizarValor,
} from "../lib/kardex.js";

const router = express.Router();

/**
 * 🔒 Ownership del docente.
 * Un MAESTRO solo puede tocar materias que tenga asignadas en ese ciclo.
 * Los demás roles autorizados pasan de largo.
 */
async function puedeCapturar(user, materiaId, cicloEscolarId) {
  if (user.role !== "MAESTRO") return true;

  const docente = await prisma.docente.findUnique({
    where: { userId: user.id },
  });

  if (!docente) return false;

  const asignacion = await prisma.asignacionMateria.findFirst({
    where: { docenteId: docente.id, materiaId, cicloEscolarId },
  });

  return Boolean(asignacion);
}

// Dirección abre y cierra columnas. Reemplaza la idea de "periodo abierto".
async function columnasAbiertas(cicloEscolarId) {
  const bloqueos = await prisma.bloqueo.findMany({
    where: { cicloEscolarId, abierto: true },
  });

  return bloqueos.map((b) => b.columna);
}

/* =========================================
   📝 CAPTURAR KARDEX
   Body: [{ alumnoId, materiaId, cicloEscolarId, PP, SP, EF, O, EE, EA, EER, articulo }]
========================================= */
router.post(
  "/",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const filas = req.body;

      if (!Array.isArray(filas) || filas.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Se espera un arreglo de calificaciones",
        });
      }

      // Cachés para no repetir consultas por cada fila.
      const materias = new Map();
      const abiertas = new Map();

      const operaciones = [];

      for (const fila of filas) {
        const { alumnoId, materiaId, cicloEscolarId, articulo } = fila;

        if (!alumnoId || !materiaId || !cicloEscolarId) {
          throw new Error("Alumno, materia y ciclo escolar son requeridos");
        }

        if (!(await puedeCapturar(req.user, materiaId, cicloEscolarId))) {
          return res.status(403).json({
            success: false,
            message: "No tienes asignada esa materia en este ciclo",
          });
        }

        if (!materias.has(materiaId)) {
          const materia = await prisma.materia.findUnique({
            where: { id: materiaId },
          });

          if (!materia) throw new Error("Materia no encontrada");

          materias.set(materiaId, materia);
        }

        if (!abiertas.has(cicloEscolarId)) {
          abiertas.set(cicloEscolarId, await columnasAbiertas(cicloEscolarId));
        }

        const materia = materias.get(materiaId);
        const permitidas = abiertas.get(cicloEscolarId);

        // 🔒 Los registros migrados nunca se recalculan ni se sobrescriben.
        const existente = await prisma.calificacion.findUnique({
          where: {
            alumnoId_materiaId_cicloEscolarId: {
              alumnoId,
              materiaId,
              cicloEscolarId,
            },
          },
        });

        if (existente?.migrado) {
          throw new Error(
            "Ese registro proviene del sistema anterior y no puede modificarse"
          );
        }

        const data = {};

        for (const [columna, campo] of Object.entries(COLUMNAS)) {
          if (!(columna in fila)) continue;

          // PROM y ND se calculan, no se capturan.
          if (columna === "PROM" || columna === "ND") continue;

          if (req.user.role === "MAESTRO" && !permitidas.includes(columna)) {
            throw new Error(`La columna ${columna} está cerrada`);
          }

          data[campo] = normalizarValor(
            fila[columna],
            materia.tipoEvaluacion,
            columna
          );
        }

        if (articulo !== undefined) data.articulo = articulo || null;

        // Se recalculan sobre el estado final (lo existente + lo que llega).
        const final = { ...existente, ...data };

        final.promedio = calcularPromedio(
          final.primerParcial,
          final.segundoParcial
        );

        final.notaDefinitiva = calcularNotaDefinitiva(final);

        data.promedio = final.promedio;
        data.notaDefinitiva = final.notaDefinitiva;
        data.estatus = calcularEstatus(final.notaDefinitiva);
        data.updatedById = req.user.id;

        operaciones.push(
          prisma.calificacion.upsert({
            where: {
              alumnoId_materiaId_cicloEscolarId: {
                alumnoId,
                materiaId,
                cicloEscolarId,
              },
            },
            update: data,
            create: {
              alumnoId,
              materiaId,
              cicloEscolarId,
              createdById: req.user.id,
              ...data,
            },
          })
        );
      }

      const result = await prisma.$transaction(operaciones);

      // 🔍 Trazabilidad: quién capturó qué y con qué valores.
      // Va después de la transacción para no alargarla.
      await auditarLote({
        req,
        accion: "ACTUALIZAR",
        entidad: "Calificacion",
        registros: result.map((c) => ({
          entidadId: c.id,
          despues: {
            alumnoId: c.alumnoId,
            materiaId: c.materiaId,
            PP: c.primerParcial,
            SP: c.segundoParcial,
            PROM: c.promedio,
            EF: c.examenFinal,
            O: c.notaFinal,
            EE: c.extraordinario,
            EA: c.adicional,
            EER: c.especial,
            ND: c.notaDefinitiva,
            estatus: c.estatus,
          },
        })),
      });

      return res.status(200).json({
        success: true,
        message: "Calificaciones guardadas correctamente",
        data: result,
      });
    } catch (error) {
      console.error("ERROR GUARDANDO CALIFICACIONES:", error);

      return res.status(400).json({
        success: false,
        message: error.message || "Error guardando calificaciones",
      });
    }
  }
);

/* =========================================
   📋 REJILLA DE CAPTURA
   Devuelve TODOS los alumnos del grupo con su fila de kardex
   (aunque todavía no tengan calificación) y qué columnas
   están abiertas. Es lo que la pantalla del maestro necesita
   para pintar la tabla completa.
========================================= */
router.get(
  "/captura/:asignacionId",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const asignacion = await prisma.asignacionMateria.findUnique({
        where: { id: req.params.asignacionId },
        include: {
          materia: true,
          grupo: true,
          cicloEscolar: true,
          docente: true,
        },
      });

      if (!asignacion) {
        return res.status(404).json({
          success: false,
          message: "Asignación no encontrada",
        });
      }

      // 🔒 Ownership: el maestro solo captura lo suyo.
      if (req.user.role === "MAESTRO") {
        const docente = await prisma.docente.findUnique({
          where: { userId: req.user.id },
        });

        if (!docente || asignacion.docenteId !== docente.id) {
          return res.status(403).json({
            success: false,
            message: "No tienes asignada esa materia",
          });
        }
      }

      const [alumnos, calificaciones, abiertas] = await Promise.all([
        prisma.alumno.findMany({
          where: { grupoId: asignacion.grupoId, activo: true },
          include: { user: true },
          orderBy: { matricula: "asc" },
        }),
        prisma.calificacion.findMany({
          where: {
            materiaId: asignacion.materiaId,
            cicloEscolarId: asignacion.cicloEscolarId,
          },
        }),
        columnasAbiertas(asignacion.cicloEscolarId),
      ]);

      const porAlumno = new Map(calificaciones.map((c) => [c.alumnoId, c]));

      const filas = alumnos.map((a) => {
        const c = porAlumno.get(a.id);

        return {
          alumnoId: a.id,
          matricula: a.matricula,
          nombre: a.user?.name ?? "",
          calificacionId: c?.id ?? null,
          migrado: c?.migrado ?? false,
          estatus: c?.estatus ?? "EN_CURSO",
          PP: c?.primerParcial ?? "",
          SP: c?.segundoParcial ?? "",
          PROM: c?.promedio ?? "",
          EF: c?.examenFinal ?? "",
          O: c?.notaFinal ?? "",
          EE: c?.extraordinario ?? "",
          EA: c?.adicional ?? "",
          EER: c?.especial ?? "",
          ND: c?.notaDefinitiva ?? "",
          articulo: c?.articulo ?? "",
        };
      });

      res.json({
        success: true,
        data: {
          asignacion: {
            id: asignacion.id,
            materiaId: asignacion.materiaId,
            cicloEscolarId: asignacion.cicloEscolarId,
            materia: asignacion.materia?.nombre,
            clave: asignacion.materia?.clave,
            tipoEvaluacion: asignacion.materia?.tipoEvaluacion,
            grupo: asignacion.grupo?.nombre,
            ciclo: asignacion.cicloEscolar?.nombre,
          },
          // PROM y ND se calculan solos: nunca se capturan.
          columnasAbiertas: abiertas.filter(
            (c) => c !== "PROM" && c !== "ND"
          ),
          alumnos: filas,
        },
      });
    } catch (error) {
      console.error("ERROR REJILLA CAPTURA:", error);

      res.status(500).json({
        success: false,
        message: "Error al obtener la rejilla de captura",
      });
    }
  }
);

/* =========================================
   🔓 COLUMNAS ABIERTAS DE UN CICLO
   El frontend la usa para saber qué puede editar.
========================================= */
router.get(
  "/bloqueos/:cicloEscolarId",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const bloqueos = await prisma.bloqueo.findMany({
        where: { cicloEscolarId: req.params.cicloEscolarId },
        orderBy: { columna: "asc" },
      });

      res.json({ success: true, data: bloqueos });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Error al obtener bloqueos",
      });
    }
  }
);

/* =========================================
   🔐 ABRIR / CERRAR UNA COLUMNA (solo dirección)
========================================= */
router.put(
  "/bloqueos/:cicloEscolarId/:columna",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR"]),
  async (req, res) => {
    try {
      const { cicloEscolarId, columna } = req.params;
      const { abierto } = req.body;

      if (!(columna in COLUMNAS)) {
        return res.status(400).json({
          success: false,
          message: "Columna de kardex desconocida",
        });
      }

      const bloqueo = await prisma.bloqueo.upsert({
        where: {
          cicloEscolarId_columna: { cicloEscolarId, columna },
        },
        update: {
          abierto: Boolean(abierto),
          fechaApertura: abierto ? new Date() : undefined,
          fechaCierre: abierto ? undefined : new Date(),
          updatedById: req.user.id,
        },
        create: {
          cicloEscolarId,
          columna,
          abierto: Boolean(abierto),
          fechaApertura: abierto ? new Date() : null,
          createdById: req.user.id,
        },
      });

      res.json({ success: true, data: bloqueo });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar el bloqueo",
      });
    }
  }
);

/* =========================================
   👨‍🎓 MI KARDEX (rol ALUMNO)
   El id sale SIEMPRE del token, nunca de la URL/body.
========================================= */
router.get(
  "/alumno/me",
  verifyToken,
  checkRole(["ALUMNO"]),
  async (req, res) => {
    try {
      const alumno = await prisma.alumno.findUnique({
        where: { userId: req.user.id },
      });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      // 🔒 bloqueo automático por adeudo
      const adeudoPendiente = await prisma.adeudo.findFirst({
        where: { alumnoId: alumno.id, pagado: false },
      });

      if (adeudoPendiente) {
        return res.status(403).json({
          success: false,
          message:
            "Tienes adeudos pendientes. Regulariza tu pago para ver tus calificaciones.",
        });
      }

      const data = await prisma.calificacion.findMany({
        where: { alumnoId: alumno.id },
        include: { materia: true, cicloEscolar: true },
        orderBy: { createdAt: "desc" },
      });

      return res.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        message: "Error al obtener calificaciones",
      });
    }
  }
);

/* =========================================
   👨‍🎓 KARDEX POR ALUMNO (staff)
========================================= */
router.get(
  "/alumno/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId } = req.params;

      const alumno = await prisma.alumno.findUnique({
        where: { id: alumnoId },
      });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      const data = await prisma.calificacion.findMany({
        where: { alumnoId },
        // La constancia de calificaciones agrupa por semestre, así que
        // hace falta el semestre de cada materia, no solo su nombre.
        include: {
          materia: { include: { semestre: true } },
          cicloEscolar: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Error al obtener calificaciones",
      });
    }
  }
);

/* =========================================
   📚 CALIFICACIONES POR MATERIA
   El MAESTRO solo ve las materias que tiene asignadas.
========================================= */
router.get(
  "/materia/:id",
  verifyToken,
  checkRole(["MAESTRO", "ADMIN", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { cicloEscolarId } = req.query;

      if (req.user.role === "MAESTRO") {
        const docente = await prisma.docente.findUnique({
          where: { userId: req.user.id },
        });

        const asignacion = await prisma.asignacionMateria.findFirst({
          where: {
            docenteId: docente?.id,
            materiaId: id,
            ...(cicloEscolarId ? { cicloEscolarId } : {}),
          },
        });

        if (!asignacion) {
          return res.status(403).json({
            success: false,
            message: "No tienes asignada esa materia",
          });
        }
      }

      const data = await prisma.calificacion.findMany({
        where: {
          materiaId: id,
          ...(cicloEscolarId ? { cicloEscolarId } : {}),
        },
        include: {
          alumno: { include: { user: true } },
          materia: true,
          cicloEscolar: true,
        },
      });

      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        message: "Error obteniendo calificaciones",
      });
    }
  }
);

export default router;
