import express from "express";
import prisma from "../lib/prisma.js";
import bcrypt from "bcrypt";

import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();
// ========================================
// 🕒 HORARIO DEL ALUMNO
// ========================================
router.get(
  "/horario/:alumnoId",

  verifyToken,

  checkRole([
    "ADMIN",
    "ALUMNO",
    "DIRECTOR",
    "SECRETARIA"
  ]),

  async (req, res) => {

    try {

      const { alumnoId } =
        req.params;

      // 🔒 SEGURIDAD
      if (
        req.user.role === "ALUMNO" &&
        req.user.alumnoId !== alumnoId
      ) {
        return res.status(403).json({
          success: false,
          message: "No autorizado"
        });
      }

      // 🔍 BUSCAR ALUMNO
      const alumno =
        await prisma.alumno.findUnique({

          where: {
            id: alumnoId
          },

          include: {

            grupo: {

              include: {

                materias: true
              }
            }
          }
        });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message:
            "Alumno no encontrado"
        });
      }

      // 📚 MATERIAS/HORARIO
      const horario =
        alumno?.grupo?.materias || [];

      res.json({
        success: true,
        data: horario
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Error al obtener horario"
      });

    }
  }
);

//////////////////////////////////////////////////////////
// 🔥 CREAR ALUMNO
//////////////////////////////////////////////////////////

router.post(
  "/",
  verifyToken,

  checkRole([
    "ADMIN",
    "SECRETARIA"
  ]),

  async (req, res) => {
    try {

      const {
        name,
        email,
        matricula,

        programaId,
        carreraId,
        grupoId,

        telefono,
        direccion,
        curp,
      } = req.body;

      // 🔥 VALIDACIONES
      if (
        !name ||
        !email ||
        !matricula
      ) {
        return res.status(400).json({
          message:
            "Nombre, email y matrícula son obligatorios"
        });
      }

      // 🔥 verificar email
      const existingUser =
        await prisma.user.findUnique({
          where: { email }
        });

      if (existingUser) {
        return res.status(400).json({
          message:
            "El correo ya está registrado"
        });
      }

      // 🔥 verificar matrícula
      const existingAlumno =
        await prisma.alumno.findUnique({
          where: { matricula }
        });

      if (existingAlumno) {
        return res.status(400).json({
          message:
            "La matrícula ya existe"
        });
      }

      // 🔥 PASSWORD TEMPORAL
      const tempPassword =
        "123456";

      const hashedPassword =
        await bcrypt.hash(
          tempPassword,
          10
        );

      // 🔥 CREAR USER
      const user =
        await prisma.user.create({
          data: {
            name,
            email,
            password:
              hashedPassword,

            role: "ALUMNO"
          }
        });

      // 🔥 CREAR ALUMNO
      const alumno =
        await prisma.alumno.create({
          data: {
            matricula,

            telefono:
              telefono || null,

            direccion:
              direccion || null,

            curp:
              curp || null,

            userId:
              user.id,

            grupoId:
  grupoId &&
  grupoId.length > 10
    ? grupoId
    : null,

programaId:
  programaId &&
  programaId.length > 10
    ? programaId
    : null,

carreraId:
  carreraId &&
  carreraId.length > 10
    ? carreraId
    : null,},

          include: {
            user: true,
            grupo: true,
            programa: true,
            carrera: true,
          }
        });

      res.json({
        message:
          "Alumno creado correctamente",

        passwordTemporal:
          tempPassword,

        data: alumno
      });

    } catch (error) {

      console.error(
        "ERROR CREAR ALUMNO:",
        error
      );
      res.status(201).json({
  message: "Alumno creado",
  data: alumno,

  credenciales: {
    correo: email,
    password: passwordTemporal,
  }
});

      res.status(500).json({
        message:
          "Error al crear alumno",

        error:
          error.message
      });
    }
  }
);

//////////////////////////////////////////////////////////
// 🔥 OBTENER TODOS LOS ALUMNOS
//////////////////////////////////////////////////////////

router.get(
  "/",
  verifyToken,

  checkRole([
    "ADMIN",
    "SECRETARIA",
    "DIRECTOR"
  ]),

  async (req, res) => {
    try {

      const alumnos =
        await prisma.alumno.findMany({
          include: {
            user: true,
            grupo: true,
            programa: true,
            carrera: true,
          },

          orderBy: {
            createdAt: "desc"
          }
        });

      res.json({
        data: alumnos
      });

    } catch (error) {

      console.error(
        "ERROR GET ALUMNOS:",
        error
      );

      res.status(500).json({
        message:
          "Error al obtener alumnos",

        error:
          error.message
      });
    }
  }
);

//////////////////////////////////////////////////////////
// 🔥 OBTENER ALUMNO POR ID
//////////////////////////////////////////////////////////

router.get(
  "/:id",
  verifyToken,

  checkRole([
    "ADMIN",
    "SECRETARIA",
    "DIRECTOR",
    "ALUMNO"
  ]),

  async (req, res) => {
    try {

      const { id } =
        req.params;

      const alumno =
        await prisma.alumno.findUnique({
          where: { id },

          include: {
            user: true,
            grupo: true,
            programa: true,
            carrera: true,
          }
        });

      if (!alumno) {
        return res.status(404).json({
          message:
            "Alumno no encontrado"
        });
      }

      res.json({
        data: alumno
      });

    } catch (error) {

      console.error(
        "ERROR GET ALUMNO:",
        error
      );

      res.status(500).json({
        message:
          "Error al obtener alumno",

        error:
          error.message
      });
    }
  }
);

//////////////////////////////////////////////////////////
// 🔥 ACTUALIZAR ALUMNO
//////////////////////////////////////////////////////////

router.put(
  "/:id",
  verifyToken,

  checkRole([
    "ADMIN",
    "SECRETARIA",
    "ALUMNO"
  ]),

  async (req, res) => {
    try {

      const { id } =
        req.params;

      const {
        name,
        email,

        matricula,

        telefono,
        direccion,
        curp,

        grupoId,
        programaId,
        carreraId,
      } = req.body;

      const alumno =
        await prisma.alumno.update({
          where: { id },

          data: {
            matricula,

            telefono,
            direccion,
            curp,

            grupoId:
              grupoId || null,

            programaId:
              programaId || null,

            carreraId:
              carreraId || null,

            user: {
              update: {
                name,
                email,
              }
            }
          },

          include: {
            user: true,
            grupo: true,
            programa: true,
            carrera: true,
          }
        });

      res.json({
        message:
          "Alumno actualizado correctamente",

        data: alumno
      });

    } catch (error) {

      console.error(
        "ERROR UPDATE ALUMNO:",
        error
      );

      res.status(500).json({
        message:
          "Error al actualizar alumno",

        error:
          error.message
      });
    }
  }
);

//////////////////////////////////////////////////////////
// 🔥 ELIMINAR ALUMNO
//////////////////////////////////////////////////////////

router.delete(
  "/:id",
  verifyToken,

  checkRole([
    "ADMIN",
    "SECRETARIA"
  ]),

  async (req, res) => {
    try {

      const { id } =
        req.params;

      const alumno =
        await prisma.alumno.findUnique({
          where: { id }
        });

      if (!alumno) {
        return res.status(404).json({
          message:
            "Alumno no encontrado"
        });
      }

      await prisma.alumno.delete({
        where: { id }
      });

      await prisma.user.delete({
        where: {
          id: alumno.userId
        }
      });

      res.json({
        message:
          "Alumno eliminado correctamente"
      });

    } catch (error) {

      console.error(
        "ERROR DELETE ALUMNO:",
        error
      );

      res.status(500).json({
        message:
          "Error al eliminar alumno",

        error:
          error.message
      });
    }
  }
);

//////////////////////////////////////////////////////////
// 🔥 MATERIAS DEL ALUMNO
//////////////////////////////////////////////////////////

// ========================================
// 📚 MATERIAS DEL ALUMNO
// ========================================
router.get(
  "/materias/:alumnoId",

  verifyToken,

  checkRole([
    "ADMIN",
    "ALUMNO",
    "DIRECTOR",
    "SECRETARIA"
  ]),

  async (req, res) => {

    try {

      const { alumnoId } =
        req.params;

      // 🔒 SEGURIDAD
      if (
        req.user.role === "ALUMNO" &&
        req.user.alumnoId !== alumnoId
      ) {
        return res.status(403).json({
          success: false,
          message: "No autorizado"
        });
      }

      // 🔍 BUSCAR ALUMNO
      const alumno =
        await prisma.alumno.findUnique({

          where: {
            id: alumnoId
          },

          include: {

            grupo: {

              include: {

                materias: true
              }
            }
          }
        });

      // ❌ NO EXISTE
      if (!alumno) {
        return res.status(404).json({
          success: false,
          message:
            "Alumno no encontrado"
        });
      }

      // 📚 MATERIAS
      const materias =
        alumno?.grupo?.materias || [];

      // ✅ RESPONSE
      res.json({
        success: true,
        data: materias
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Error al obtener materias"
      });

    }
  }
);

export default router;