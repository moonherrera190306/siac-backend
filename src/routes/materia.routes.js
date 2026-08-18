import express from "express";

import prisma from "../lib/prisma.js";

import {
  verifyToken
} from "../middleware/auth.middleware.js";

import {
  checkRole
} from "../middleware/role.middleware.js";

const router = express.Router();


// ========================================
// 📚 CREAR MATERIA
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
        nombre,
        clave,
        tipo,
        tipoEvaluacion,
        creditos,
        horasSemana,
        semestreId,
        trayectoriaId
      } = req.body;

      // 🔴 VALIDACIÓN
      if (!nombre) {

        return res.status(400).json({

          success: false,

          message:
            "Nombre requerido"

        });

      }

      // 📚 CREAR
      const materia =
        await prisma.materia.create({

          data: {

            nombre,
            clave: clave || null,
            tipo: tipo || "OBLIGATORIA",
            tipoEvaluacion: tipoEvaluacion || "NUMERICA",
            creditos: creditos ? Number(creditos) : null,
            horasSemana: horasSemana ? Number(horasSemana) : null,
            semestreId: semestreId || null,
            trayectoriaId: trayectoriaId || null

          }

        });

      res.json({

        success: true,

        message:
          "Materia creada correctamente",

        data: materia

      });

    } catch (error) {

      console.error(
        "ERROR CREAR MATERIA:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Error al crear materia"

      });

    }

  }
);


// ========================================
// 📚 OBTENER MATERIAS
// ========================================
router.get(
  "/",

  verifyToken,

  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),

  async (req, res) => {

    try {

      const materias =
        await prisma.materia.findMany({

          include: {

            asignaciones: {

              include: {

                grupo: true,

                docente: {

                  include: {
                    user: true
                  }

                },

                cicloEscolar: true

              }

            }

          },

          orderBy: {
            createdAt: "desc"
          }

        });

      res.json({

        success: true,

        data: materias

      });

    } catch (error) {

      console.error(
        "ERROR OBTENER MATERIAS:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Error al obtener materias"

      });

    }

  }
);


// ========================================
// 📚 OBTENER MATERIA POR ID
// ========================================
router.get(
  "/:id",

  verifyToken,

  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),

  async (req, res) => {

    try {

      const { id } = req.params;

      const materia =
        await prisma.materia.findUnique({

          where: {
            id
          },

          include: {

            asignaciones: {

              include: {

                grupo: true,

                docente: {

                  include: {
                    user: true
                  }

                },

                cicloEscolar: true

              }

            }

          }

        });

      if (!materia) {

        return res.status(404).json({

          success: false,

          message:
            "Materia no encontrada"

        });

      }

      res.json({

        success: true,

        data: materia

      });

    } catch (error) {

      console.error(
        "ERROR OBTENER MATERIA:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Error obteniendo materia"

      });

    }

  }
);


// ========================================
// 📚 ELIMINAR MATERIA
// ========================================
// ========================================
// ✏️ ACTUALIZAR MATERIA
// ========================================
router.put(
  "/:id",

  verifyToken,

  checkRole(["ADMIN", "DIRECTOR"]),

  async (req, res) => {
    try {
      const {
        nombre,
        clave,
        tipo,
        tipoEvaluacion,
        creditos,
        horasSemana,
        semestreId,
        trayectoriaId,
        activo
      } = req.body;

      const materia = await prisma.materia.findUnique({
        where: { id: req.params.id }
      });

      if (!materia) {
        return res.status(404).json({
          success: false,
          message: "Materia no encontrada"
        });
      }

      // 🔒 La clave es la del plan de estudios: si se repite,
      // dos materias distintas quedan con el mismo CVE.
      if (clave && clave !== materia.clave) {
        const ocupada = await prisma.materia.findUnique({
          where: { clave }
        });

        if (ocupada) {
          return res.status(400).json({
            success: false,
            message: "Ya existe una materia con esa clave"
          });
        }
      }

      // 🔒 Cambiar el tipo de evaluación con calificaciones ya
      // capturadas dejaría notas incoherentes (un 8 en una materia
      // que ahora solo acepta AC/NA).
      if (tipoEvaluacion && tipoEvaluacion !== materia.tipoEvaluacion) {
        const capturadas = await prisma.calificacion.count({
          where: { materiaId: materia.id }
        });

        if (capturadas > 0) {
          return res.status(400).json({
            success: false,
            message: `No se puede cambiar el tipo de evaluación: ya hay ${capturadas} calificación(es) capturada(s)`
          });
        }
      }

      const actualizada = await prisma.materia.update({
        where: { id: materia.id },
        data: {
          nombre: nombre ?? undefined,
          clave: clave ?? undefined,
          tipo: tipo ?? undefined,
          tipoEvaluacion: tipoEvaluacion ?? undefined,
          creditos: creditos !== undefined ? Number(creditos) || null : undefined,
          horasSemana:
            horasSemana !== undefined ? Number(horasSemana) || null : undefined,
          semestreId: semestreId !== undefined ? semestreId || null : undefined,
          trayectoriaId:
            trayectoriaId !== undefined ? trayectoriaId || null : undefined,
          activo: activo !== undefined ? Boolean(activo) : undefined
        },
        include: { semestre: true, trayectoria: true }
      });

      res.json({ success: true, data: actualizada });

    } catch (error) {
      console.error("ERROR ACTUALIZANDO MATERIA:", error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar la materia"
      });
    }
  }
);


router.delete(
  "/:id",

  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR"
  ]),

  async (req, res) => {

    try {

      const { id } = req.params;

      // 🔥 ELIMINAR ASIGNACIONES
      await prisma.asignacionMateria.deleteMany({

        where: {
          materiaId: id
        }

      });

      // 🔥 ELIMINAR MATERIA
      await prisma.materia.delete({

        where: {
          id
        }

      });

      res.json({

        success: true,

        message:
          "Materia eliminada correctamente"

      });

    } catch (error) {

      console.error(
        "ERROR ELIMINAR MATERIA:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Error eliminando materia"

      });

    }

  }
);

export default router;