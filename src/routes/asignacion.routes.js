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
// 📚 OBTENER ASIGNACIONES
// ========================================
router.get(
  "/",

  verifyToken,

  checkRole([
    "ADMIN",
    "DIRECTOR",
    "SECRETARIA"
  ]),

  async (req, res) => {

    try {

      const asignaciones =
        await prisma.asignacionMateria.findMany({

          include: {

            materia: true,

            docente: {
              include: {
                user: true
              }
            },

            grupo: true,

            cicloEscolar: true,

            // 🔥 Los bloques de horario se administran en /api/horarios,
            // pero la lista los necesita para mostrar cuántos tiene cada una.
            horarios: {
              orderBy: [{ dia: "asc" }, { horaInicio: "asc" }]
            }

          },

          orderBy: {
            createdAt: "desc"
          }

        });

      res.json({
        success: true,
        data: asignaciones
      });

    } catch (error) {

      console.error(
        "🔥 ERROR OBTENIENDO ASIGNACIONES:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Error obteniendo asignaciones"
      });

    }
  }
);


// ========================================
// ➕ CREAR ASIGNACIÓN
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

        materiaId,
        docenteId,
        grupoId,
        cicloEscolarId,
        horarios,
        aula

      } = req.body;

      // 🔥 VALIDACIONES
      if (
        !materiaId ||
        !docenteId ||
        !grupoId ||
        !cicloEscolarId
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Faltan campos obligatorios"
        });

      }

      // 🔍 VALIDAR MATERIA
      const materia =
        await prisma.materia.findUnique({
          where: {
            id: materiaId
          }
        });

      if (!materia) {

        return res.status(404).json({
          success: false,
          message:
            "Materia no encontrada"
        });

      }

      // 🔍 VALIDAR DOCENTE
      const docente =
        await prisma.docente.findUnique({
          where: {
            id: docenteId
          }
        });

      if (!docente) {

        return res.status(404).json({
          success: false,
          message:
            "Docente no encontrado"
        });

      }

      // 🔍 VALIDAR GRUPO
      const grupo =
        await prisma.grupo.findUnique({
          where: {
            id: grupoId
          }
        });

      if (!grupo) {

        return res.status(404).json({
          success: false,
          message:
            "Grupo no encontrado"
        });

      }

      // 🔍 VALIDAR CICLO
      const ciclo =
        await prisma.cicloEscolar.findUnique({
          where: {
            id: cicloEscolarId
          }
        });

      if (!ciclo) {

        return res.status(404).json({
          success: false,
          message:
            "Ciclo escolar no encontrado"
        });

      }

      // 🚫 EVITAR DUPLICADOS
      // 🔥 la llave real es materia+grupo+ciclo, sin importar el docente:
      // un grupo no puede tener la misma materia dos veces en el mismo ciclo
      const existe =
        await prisma.asignacionMateria.findFirst({

          where: {

            materiaId,
            grupoId,
            cicloEscolarId

          }

        });

      if (existe) {

        return res.status(400).json({
          success: false,
          message:
            "Este grupo ya tiene esta materia asignada en este ciclo escolar"
        });

      }

      // ✅ CREAR
      const asignacion =
        await prisma.asignacionMateria.create({

          data: {

            materiaId,
            docenteId,
            grupoId,
            cicloEscolarId,
            aula,

            // 🔥 El horario dejó de ser texto: se crean registros reales.
            // horarios: [{ dia: "LUNES", horaInicio: "07:00", horaFin: "08:00" }]
            ...(Array.isArray(horarios) && horarios.length > 0
              ? { horarios: { create: horarios } }
              : {})

          },

          include: {

            materia: true,

            docente: {
              include: {
                user: true
              }
            },

            grupo: true,

            cicloEscolar: true

          }

        });

      res.json({
        success: true,
        message:
          "Asignación creada correctamente",
        data: asignacion
      });

    } catch (error) {

      console.error(
        "🔥 ERROR CREANDO ASIGNACIÓN:",
        error
      );

      // 🔒 respaldo del @@unique en el schema, por si el findFirst
      // no alcanzó a atrapar una race condition
      if (error.code === "P2002") {
        return res.status(400).json({
          success: false,
          message:
            "Este grupo ya tiene esta materia asignada en este ciclo escolar"
        });
      }

      res.status(500).json({
        success: false,
        message:
          "Error creando asignación"
      });

    }
  }
);


// ========================================
// ❌ ELIMINAR ASIGNACIÓN
// ========================================
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

      // 🔍 VALIDAR
      const asignacion =
        await prisma.asignacionMateria.findUnique({

          where: {
            id
          }

        });

      if (!asignacion) {

        return res.status(404).json({
          success: false,
          message:
            "Asignación no encontrada"
        });

      }

      // ❌ ELIMINAR
      await prisma.asignacionMateria.delete({

        where: {
          id
        }

      });

      res.json({
        success: true,
        message:
          "Asignación eliminada"
      });

    } catch (error) {

      console.error(
        "🔥 ERROR ELIMINANDO ASIGNACIÓN:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Error eliminando asignación"
      });

    }
  }
);

export default router;