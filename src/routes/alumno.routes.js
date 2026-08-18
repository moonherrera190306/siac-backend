import express from "express";
import prisma from "../lib/prisma.js";
import bcrypt from "bcrypt";

import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { auditar } from "../lib/audit.js";

const router = express.Router();

/* =========================================
   🔒 HELPER: obtener el alumnoId dueño del token
========================================= */
async function obtenerAlumnoIdPropio(userId) {
  const propio = await prisma.alumno.findUnique({ where: { userId } });
  return propio?.id || null;
}

// Contraseña temporal legible pero no adivinable.
function generarPasswordTemporal() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

  let salida = "";

  for (let i = 0; i < 10; i++) {
    salida += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }

  return salida;
}

/* =========================================
   🕒 HORARIO DEL ALUMNO
========================================= */
router.get(
  "/horario/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "ALUMNO", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId } = req.params;

      // 🔒 SEGURIDAD: si es ALUMNO, solo puede ver el suyo
      if (req.user.role === "ALUMNO") {
        const propioId = await obtenerAlumnoIdPropio(req.user.id);
        if (propioId !== alumnoId) {
          return res.status(403).json({
            success: false,
            message: "No autorizado",
          });
        }
      }

      const alumno = await prisma.alumno.findUnique({
        where: { id: alumnoId },
        include: {
          grupo: {
            include: {
              asignaciones: {
                where: { cicloEscolar: { activo: true } },
                include: {
                  materia: true,
                  docente: { include: { user: true } },
                  cicloEscolar: true,
                  // 🔥 El horario ya no es un String suelto: son registros reales.
                  horarios: { orderBy: [{ dia: "asc" }, { horaInicio: "asc" }] },
                },
              },
            },
          },
        },
      });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      const horario = alumno?.grupo?.asignaciones || [];

      res.json({ success: true, data: horario });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Error al obtener horario",
      });
    }
  }
);

/* =========================================
   🔥 CREAR ALUMNO
========================================= */
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const {
        name,
        email,
        matricula,
        programaId,
        carreraId,
        grupoId,
        trayectoriaId,
        telefono,
        direccion,
        curp,
      } = req.body;

      if (!name || !email || !matricula) {
        return res.status(400).json({
          success: false,
          message: "Nombre, email y matrícula son obligatorios",
        });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "El correo ya está registrado",
        });
      }

      const existingAlumno = await prisma.alumno.findUnique({
        where: { matricula },
      });

      if (existingAlumno) {
        return res.status(400).json({
          success: false,
          message: "La matrícula ya existe",
        });
      }

      // 🔒 Las trayectorias son exclusivas de preparatoria.
      if (trayectoriaId) {
        const trayectoria = await prisma.trayectoria.findUnique({
          where: { id: trayectoriaId },
          include: { nivelAcademico: true },
        });

        if (!trayectoria) {
          return res.status(404).json({
            success: false,
            message: "Trayectoria no encontrada",
          });
        }

        if (trayectoria.nivelAcademico?.clave !== "PREPARATORIA") {
          return res.status(400).json({
            success: false,
            message: "Las trayectorias solo aplican a alumnos de preparatoria",
          });
        }
      }

      // 🔥 Contraseña temporal aleatoria. Ya no se asigna "123456" a nadie:
      // el alumno queda obligado a cambiarla en su primer acceso.
      const tempPassword = generarPasswordTemporal();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "ALUMNO",
          debeCambiarPassword: true,
        },
      });

      const alumno = await prisma.alumno.create({
        data: {
          matricula,
          telefono: telefono || null,
          direccion: direccion || null,
          curp: curp || null,
          userId: user.id,
          grupoId: grupoId || null,
          programaId: programaId || null,
          carreraId: carreraId || null,
          // Solo aplica en preparatoria; se valida abajo.
          trayectoriaId: trayectoriaId || null,
        },
        include: {
          user: true,
          grupo: true,
          programa: true,
          carrera: true,
        },
      });

      res.status(201).json({
        success: true,
        message: "Alumno creado correctamente",
        passwordTemporal: tempPassword,
        data: alumno,
      });
    } catch (error) {
      console.error("ERROR CREAR ALUMNO:", error);
      res.status(500).json({
        success: false,
        message: "Error al crear alumno",
        error: error.message,
      });
    }
  }
);

/* =========================================
   🔥 OBTENER TODOS LOS ALUMNOS
========================================= */
router.get(
  "/",
  verifyToken,
  // 🔥 CAJA necesita listar alumnos para poder cobrarles: sin esto
  // el selector de la pantalla de cobros llega vacío.
  checkRole(["ADMIN", "SECRETARIA", "DIRECTOR", "CAJA"]),
  async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(200, Number(req.query.perPage) || 50);

      const texto = (req.query.search || "").trim();

      // 🔥 Sin paginación esto devolvía el padrón completo en cada carga.
      const where = {
        ...(req.query.grupoId ? { grupoId: req.query.grupoId } : {}),
        ...(req.query.estatus ? { estatusAcademico: req.query.estatus } : {}),
        ...(req.query.activo !== undefined
          ? { activo: req.query.activo === "true" }
          : {}),
        ...(texto
          ? {
              OR: [
                { matricula: { contains: texto, mode: "insensitive" } },
                { curp: { contains: texto, mode: "insensitive" } },
                { user: { name: { contains: texto, mode: "insensitive" } } },
                { user: { email: { contains: texto, mode: "insensitive" } } },
              ],
            }
          : {}),
      };

      const [alumnos, total] = await Promise.all([
        prisma.alumno.findMany({
          where,
          include: {
            user: true,
            grupo: true,
            programa: true,
            carrera: true,
            trayectoria: true,
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.alumno.count({ where }),
      ]);

      res.json({
        success: true,
        data: alumnos,
        meta: { page, perPage, total, pages: Math.ceil(total / perPage) },
      });
    } catch (error) {
      console.error("ERROR GET ALUMNOS:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener alumnos",
        error: error.message,
      });
    }
  }
);

/* =========================================
   🔥 OBTENER ALUMNO POR ID
========================================= */
router.get(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA", "DIRECTOR", "CAJA", "ALUMNO"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // 🔒 SEGURIDAD: si es ALUMNO, solo puede ver su propio registro
      if (req.user.role === "ALUMNO") {
        const propioId = await obtenerAlumnoIdPropio(req.user.id);
        if (propioId !== id) {
          return res.status(403).json({
            success: false,
            message: "No autorizado",
          });
        }
      }

      const alumno = await prisma.alumno.findUnique({
        where: { id },
        include: {
          user: true,
          // El turno y la trayectoria salen impresos en la credencial.
          grupo: { include: { turno: true, semestre: true } },
          programa: true,
          carrera: true,
          trayectoria: true,
        },
      });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      res.json({ success: true, data: alumno });
    } catch (error) {
      console.error("ERROR GET ALUMNO:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener alumno",
        error: error.message,
      });
    }
  }
);

/* =========================================
   🔥 ACTUALIZAR PERFIL PROPIO
   La pantalla `alumno/perfil` llamaba a esta ruta desde siempre
   y no existía: el alumno nunca pudo guardar sus datos.
   Solo permite campos de contacto, nunca datos académicos.
========================================= */
router.put(
  "/perfil/:alumnoId",
  verifyToken,
  checkRole(["ALUMNO", "ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId } = req.params;

      // 🔒 Un alumno solo edita su propio perfil.
      if (req.user.role === "ALUMNO") {
        const propioId = await obtenerAlumnoIdPropio(req.user.id);

        if (propioId !== alumnoId) {
          return res.status(403).json({
            success: false,
            message: "No autorizado",
          });
        }
      }

      const {
        telefono,
        direccion,
        ciudad,
        estado,
        codigoPostal,
        tutorNombre,
        tutorTelefono,
        foto,
      } = req.body;

      // 🔥 Lista blanca: matrícula, grupo, carrera y programa
      // no se tocan desde aquí ni aunque vengan en el body.
      const alumno = await prisma.alumno.update({
        where: { id: alumnoId },
        data: {
          telefono: telefono ?? undefined,
          direccion: direccion ?? undefined,
          ciudad: ciudad ?? undefined,
          estado: estado ?? undefined,
          codigoPostal: codigoPostal ?? undefined,
          tutorNombre: tutorNombre ?? undefined,
          tutorTelefono: tutorTelefono ?? undefined,
          foto: foto ?? undefined,
        },
        include: { user: true, grupo: true, carrera: true, trayectoria: true },
      });

      res.json({
        success: true,
        message: "Perfil actualizado correctamente",
        data: alumno,
      });
    } catch (error) {
      console.error("ERROR PUT PERFIL:", error);

      res.status(500).json({
        success: false,
        message: "Error al actualizar el perfil",
      });
    }
  }
);

/* =========================================
   🔥 ACTUALIZAR ALUMNO
========================================= */
router.put(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA", "ALUMNO"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const esAlumno = req.user.role === "ALUMNO";

      // 🔒 SEGURIDAD: si es ALUMNO, solo puede editar su propio registro
      if (esAlumno) {
        const propioId = await obtenerAlumnoIdPropio(req.user.id);
        if (propioId !== id) {
          return res.status(403).json({
            success: false,
            message: "No autorizado",
          });
        }
      }

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

      // 🔒 un ALUMNO no puede reasignarse matrícula, grupo, programa o carrera
      const dataAcademica = esAlumno
        ? {}
        : {
            matricula,
            grupoId: grupoId || null,
            programaId: programaId || null,
            carreraId: carreraId || null,
          };

      const alumno = await prisma.alumno.update({
        where: { id },
        data: {
          telefono,
          direccion,
          curp,
          ...dataAcademica,
          user: {
            update: { name, email },
          },
        },
        include: {
          user: true,
          grupo: true,
          programa: true,
          carrera: true,
        },
      });

      res.json({
        success: true,
        message: "Alumno actualizado correctamente",
        data: alumno,
      });
    } catch (error) {
      console.error("ERROR UPDATE ALUMNO:", error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar alumno",
        error: error.message,
      });
    }
  }
);

/* =========================================
   🔥 ELIMINAR ALUMNO
========================================= */
router.delete(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const alumno = await prisma.alumno.findUnique({
        where: { id },
      });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      // 🔥 Baja lógica: un alumno nunca se borra, se da de baja.
      // El expediente, las calificaciones y los pagos deben conservarse.
      const { motivo } = req.body;

      await prisma.$transaction([
        prisma.alumno.update({
          where: { id },
          data: {
            activo: false,
            estatusAcademico: "BAJA_DEFINITIVA",
            fechaBaja: new Date(),
            motivoBaja: motivo || null,
          },
        }),
        prisma.user.update({
          where: { id: alumno.userId },
          data: { activo: false },
        }),
      ]);

      // 🔍 Dar de baja a un alumno tiene que poder rastrearse.
      await auditar({
        req,
        accion: "ELIMINAR",
        entidad: "Alumno",
        entidadId: id,
        antes: {
          matricula: alumno.matricula,
          activo: alumno.activo,
          estatusAcademico: alumno.estatusAcademico,
          grupoId: alumno.grupoId,
        },
        despues: {
          activo: false,
          estatusAcademico: "BAJA_DEFINITIVA",
          motivo: motivo || null,
        },
      });

      res.json({
        success: true,
        message: "Alumno dado de baja correctamente",
      });
    } catch (error) {
      console.error("ERROR DELETE ALUMNO:", error);
      res.status(500).json({
        success: false,
        message: "Error al eliminar alumno",
        error: error.message,
      });
    }
  }
);

/* =========================================
   📚 MATERIAS DEL ALUMNO
========================================= */
router.get(
  "/materias/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "ALUMNO", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId } = req.params;

      if (req.user.role === "ALUMNO") {
        const propioId = await obtenerAlumnoIdPropio(req.user.id);
        if (propioId !== alumnoId) {
          return res.status(403).json({
            success: false,
            message: "No autorizado",
          });
        }
      }

      const alumno = await prisma.alumno.findUnique({
        where: { id: alumnoId },
        include: {
          grupo: {
            include: {
              asignaciones: {
                where: { cicloEscolar: { activo: true } },
                include: { materia: true },
              },
            },
          },
        },
      });

      if (!alumno) {
        return res.status(404).json({
          success: false,
          message: "Alumno no encontrado",
        });
      }

      const materias =
        alumno?.grupo?.asignaciones?.map((a) => a.materia) || [];

      res.json({ success: true, data: materias });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Error al obtener materias",
      });
    }
  }
);

export default router;