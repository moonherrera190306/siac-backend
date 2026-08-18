import express from "express";
import bcrypt from "bcrypt";

import prisma from "../lib/prisma.js";

import {
  verifyToken
} from "../middleware/auth.middleware.js";

import {
  checkRole
} from "../middleware/role.middleware.js";

const router = express.Router();


// ========================================
// 👨‍🏫 OBTENER DOCENTES
// ========================================
router.get(
  "/",

  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR"
  ]),

  async (req, res) => {

    try {

      const docentes =
        await prisma.docente.findMany({

          include: {
            user: true,
            asignaciones: true
          }

        });

      res.json({
        success: true,
        data: docentes
      });

    } catch (error) {

      console.error(
        "ERROR DOCENTES:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Error al obtener docentes"

      });

    }

  }
);


// ========================================
// 👨‍🏫 CREAR DOCENTE
// ========================================
router.post(
  "/",

  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR"
  ]),

  async (req, res) => {

    try {

      const {
        name,
        email,
        password,
        cedula,
        rfc,
        telefono
      } = req.body;

      if (
        !name ||
        !email ||
        !password
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Datos incompletos"

        });

      }

      // 🔍 VALIDAR EMAIL
      const userExists =
        await prisma.user.findUnique({

          where: {
            email
          }

        });

      if (userExists) {

        return res.status(400).json({

          success: false,

          message:
            "El correo ya existe"

        });

      }

      // 🔐 HASH PASSWORD
      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );

      // 👤 USER
      const user =
        await prisma.user.create({

          data: {

            name,
            email,

            password:
              hashedPassword,

            role: "MAESTRO"

          }

        });

      // 👨‍🏫 DOCENTE
      const docente =
        await prisma.docente.create({

          data: {

            userId: user.id,

            // 🔥 Datos propios del docente: sin cédula ni RFC
            // no se pueden emitir actas ni reportes oficiales.
            nombre: name,
            cedula: cedula || null,
            rfc: rfc || null,
            telefono: telefono || null

          },

          include: {
            user: true
          }

        });

      res.json({

        success: true,

        message:
          "Docente creado correctamente",

        data: docente

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        success: false,

        message:
          "Error creando docente"

      });

    }

  }
);


// ========================================
// 👨‍🏫 DASHBOARD DOCENTE
// ========================================
router.get(
  "/dashboard",

  verifyToken,

  checkRole([
    "MAESTRO",
    "ADMIN"
  ]),

  async (req, res) => {

    try {

      const docente =
        await prisma.docente.findFirst({

          where: {
            userId: req.user.id
          },

          include: {

            asignaciones: {

              include: {
                materia: true,
                grupo: true
              }

            }

          }

        });

      if (!docente) {

        return res.status(404).json({

          success: false,

          message:
            "Docente no encontrado"

        });

      }

      res.json({

        success: true,

        data: {

          materias:
            docente.asignaciones.length,

          grupos:
            docente.asignaciones.length,

          asignaciones:
            docente.asignaciones

        }

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        success: false,

        message:
          "Error obteniendo dashboard"

      });

    }

  }
);


// ========================================
// 🕐 HORARIO DEL DOCENTE
// Sale de sus asignaciones del ciclo activo.
// ========================================
router.get(
  "/horario",

  verifyToken,

  checkRole(["MAESTRO", "ADMIN", "DIRECTOR"]),

  async (req, res) => {
    try {
      const docente = await prisma.docente.findFirst({
        where: { userId: req.user.id },
      });

      if (!docente) {
        return res.status(404).json({
          success: false,
          message: "Docente no encontrado",
        });
      }

      const asignaciones = await prisma.asignacionMateria.findMany({
        where: {
          docenteId: docente.id,
          cicloEscolar: { activo: true },
        },
        include: {
          materia: true,
          grupo: { include: { turno: true } },
          horarios: {
            orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
          },
        },
      });

      // Se devuelve plano: una fila por bloque de horario real.
      const bloques = [];

      for (const a of asignaciones) {
        for (const h of a.horarios) {
          bloques.push({
            asignacionId: a.id,
            horarioId: h.id,
            dia: h.dia,
            horaInicio: h.horaInicio,
            horaFin: h.horaFin,
            aula: h.aula || a.aula,
            materia: a.materia?.nombre,
            grupo: a.grupo?.nombre,
            turno: a.grupo?.turno?.nombre,
          });
        }
      }

      res.json({
        success: true,
        data: bloques,
        // Si está vacío es porque no hay horarios capturados,
        // no porque no haya asignaciones.
        meta: { asignaciones: asignaciones.length },
      });
    } catch (error) {
      console.error("ERROR HORARIO DOCENTE:", error);

      res.status(500).json({
        success: false,
        message: "Error obteniendo el horario",
      });
    }
  }
);


// ========================================
// 👨‍🏫 GRUPOS DOCENTE
// ========================================
router.get(
  "/grupos",

  verifyToken,

  checkRole([
    "MAESTRO",
    "ADMIN"
  ]),

  async (req, res) => {

    try {

      const docente =
        await prisma.docente.findFirst({

          where: {
            userId: req.user.id
          },

          include: {

            // Solo el ciclo activo: al maestro no le sirve ver
            // asignaciones de ciclos pasados en su pantalla diaria.
            asignaciones: {

              where: {
                cicloEscolar: { activo: true }
              },

              include: {
                grupo: {
                  include: {
                    turno: true,
                    semestre: true,
                    _count: { select: { alumnos: true } }
                  }
                },
                materia: true,
                cicloEscolar: true,
                horarios: {
                  orderBy: [{ dia: "asc" }, { horaInicio: "asc" }]
                }
              }

            }

          }

        });

      if (!docente) {

        return res.status(404).json({

          success: false,

          message:
            "Docente no encontrado"

        });

      }

      res.json({

        success: true,

        data:
          docente.asignaciones

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        success: false,

        message:
          "Error cargando grupos"

      });

    }

  }
);


// ========================================
// 👨‍🏫 OBTENER UN DOCENTE
// ========================================
router.get(
  "/:id",

  verifyToken,

  checkRole(["ADMIN", "DIRECTOR"]),

  async (req, res) => {
    try {
      const docente = await prisma.docente.findUnique({
        where: { id: req.params.id },
        include: {
          user: true,
          asignaciones: {
            include: {
              materia: true,
              grupo: true,
              cicloEscolar: true,
              horarios: true,
            },
          },
        },
      });

      if (!docente) {
        return res.status(404).json({
          success: false,
          message: "Docente no encontrado",
        });
      }

      res.json({ success: true, data: docente });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener el docente",
      });
    }
  }
);


// ========================================
// ✏️ ACTUALIZAR DOCENTE
// ========================================
router.put(
  "/:id",

  verifyToken,

  checkRole(["ADMIN", "DIRECTOR"]),

  async (req, res) => {
    try {
      const { nombre, cedula, rfc, telefono, email } = req.body;

      const docente = await prisma.docente.findUnique({
        where: { id: req.params.id },
      });

      if (!docente) {
        return res.status(404).json({
          success: false,
          message: "Docente no encontrado",
        });
      }

      // 🔒 El correo es la llave de acceso: no puede duplicarse.
      if (email) {
        const ocupado = await prisma.user.findFirst({
          where: { email, NOT: { id: docente.userId } },
        });

        if (ocupado) {
          return res.status(400).json({
            success: false,
            message: "Ese correo ya está registrado",
          });
        }
      }

      const actualizado = await prisma.$transaction(async (tx) => {
        if (nombre || email) {
          await tx.user.update({
            where: { id: docente.userId },
            data: {
              ...(nombre ? { name: nombre } : {}),
              ...(email ? { email } : {}),
            },
          });
        }

        return tx.docente.update({
          where: { id: docente.id },
          data: {
            nombre: nombre ?? undefined,
            cedula: cedula ?? undefined,
            rfc: rfc ?? undefined,
            telefono: telefono ?? undefined,
          },
          include: { user: true },
        });
      });

      res.json({ success: true, data: actualizado });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar el docente",
      });
    }
  }
);


// ========================================
// 🔁 ACTIVAR / DESACTIVAR DOCENTE
// Nunca se borra: un docente con asignaciones e historial
// de clases no puede desaparecer de la base.
// ========================================
router.put(
  "/:id/estado",

  verifyToken,

  checkRole(["ADMIN", "DIRECTOR"]),

  async (req, res) => {
    try {
      const { activo } = req.body;

      const docente = await prisma.docente.findUnique({
        where: { id: req.params.id },
      });

      if (!docente) {
        return res.status(404).json({
          success: false,
          message: "Docente no encontrado",
        });
      }

      // 🔒 Desactivar a un docente que aún imparte deja grupos sin maestro.
      if (activo === false) {
        const vigentes = await prisma.asignacionMateria.count({
          where: {
            docenteId: docente.id,
            cicloEscolar: { activo: true },
          },
        });

        if (vigentes > 0) {
          return res.status(400).json({
            success: false,
            message: `No se puede desactivar: tiene ${vigentes} asignación(es) en el ciclo activo. Reasígnalas primero.`,
          });
        }
      }

      const resultado = await prisma.$transaction(async (tx) => {
        const d = await tx.docente.update({
          where: { id: docente.id },
          data: { activo: Boolean(activo) },
          include: { user: true },
        });

        // El acceso al sistema se corta junto con el docente.
        await tx.user.update({
          where: { id: docente.userId },
          data: { activo: Boolean(activo) },
        });

        return d;
      });

      res.json({
        success: true,
        message: activo ? "Docente activado" : "Docente desactivado",
        data: resultado,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al cambiar el estado del docente",
      });
    }
  }
);

export default router;